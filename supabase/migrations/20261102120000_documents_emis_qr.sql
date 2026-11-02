-- Idea 22: verifiable documents (QR code on the bulletin PDF).
-- Proposal prepared 1 Nov 2026. NOT applied to any live database.
--
--  * documents_emis           : one row per issued document (bulletin today; certificat / attestation later).
--                               Holds a short public code (EF-XXXXX-XXXXX), a SHA-256 fingerprint of the key
--                               figures computed ON THE SERVER, and a revoke flag. No grades are stored.
--  * ef_issue_documents(jsonb): called by the app when a PDF is generated. Same access rule as the bulletin
--                               itself (ef_can_view_student_bulletin). Same data => same code (no duplicates).
--  * ef_verify_document(...)  : the ONLY thing the public page can reach, and only through the edge function
--                               `verifier-document` (service role). Returns type, period, year, school name,
--                               the student's initials and the issue date, never grades, never an id.
--  * ef_revoke_document(...)  : school admin / super admin cancels a document that was issued by mistake.
-- Nothing here is readable by anon.

create table if not exists public.documents_emis (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique
                     check (code ~ '^EF-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$'),
  school_id        uuid not null references public.ecoles(id) on delete cascade,
  student_id       uuid not null references public.profils(id) on delete cascade,
  class_section_id uuid references public.classes(id) on delete set null,
  doc_type         text not null check (doc_type in ('bulletin', 'certificat_scolarite', 'attestation')),
  period_label     text not null check (char_length(period_label) between 1 and 60),
  year_label       text,
  payload_hash     text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  check_hash       text check (check_hash is null or check_hash ~ '^[0-9a-f]{64}$'),
  issued_by        uuid references public.profils(id) on delete set null,
  issued_at        timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid references public.profils(id) on delete set null,
  revoked_reason   text,
  verified_count   integer not null default 0,
  last_verified_at timestamptz
);
create index if not exists documents_emis_school_idx on public.documents_emis (school_id, issued_at desc);
create index if not exists documents_emis_student_idx
  on public.documents_emis (student_id, class_section_id, doc_type, period_label, issued_at desc);

alter table public.documents_emis enable row level security;
revoke all on public.documents_emis from anon, authenticated;
grant select on public.documents_emis to authenticated;

-- Who can list documents: super admin, admin of the school, and whoever issued it.
drop policy if exists ef_documents_emis_select on public.documents_emis;
create policy ef_documents_emis_select on public.documents_emis for select to authenticated
  using (
    (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
    or issued_by = (select auth.uid())
  );

-- ---------------------------------------------------------------- code ----
-- 10 characters out of 32 unambiguous ones (no 0/O/1/I): 32^10 ~ 1e15 possibilities.
create or replace function public.ef_new_document_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12];  -- skip the bytes holding the uuid version bits
  out text := '';
  i int;
begin
  for i in 1..10 loop
    out := out || substr(alphabet, (get_byte(b, idx[i]) % 32) + 1, 1);
    if i = 5 then out := out || '-'; end if;
  end loop;
  return 'EF-' || out;
end;
$$;
revoke all on function public.ef_new_document_code() from public, anon, authenticated;

-- --------------------------------------------------------------- issue ----
create or replace function public.ef_issue_documents(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_out jsonb := '[]'::jsonb;
  v_student uuid;
  v_class uuid;
  v_type text;
  v_period text;
  v_periods text[];
  v_school uuid;
  v_year text;
  v_avg numeric;
  v_cnt bigint; v_sum numeric; v_max numeric; v_abs bigint;
  v_hash text;
  v_check text;
  v_code text;
  v_tries int;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then
    raise exception 'Liste de documents invalide (300 maximum)' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_student := (it ->> 'student_id')::uuid;
    v_class   := (it ->> 'class_section_id')::uuid;
    v_type    := coalesce(nullif(btrim(it ->> 'doc_type'), ''), 'bulletin');
    v_period  := btrim(coalesce(it ->> 'period_label', ''));
    if v_student is null or v_class is null or v_period = '' or char_length(v_period) > 60 then
      raise exception 'Document invalide' using errcode = '22023';
    end if;
    if v_type <> 'bulletin' then
      raise exception 'Type de document non pris en charge' using errcode = '22023';
    end if;
    if not public.ef_can_view_student_bulletin(v_student, v_class) then
      raise exception 'Accès non autorisé' using errcode = '42501';
    end if;

    select c.school_id, a.label into v_school, v_year
    from public.classes c join public.annees_scolaires a on a.id = c.academic_year_id
    where c.id = v_class;

    v_periods := case when v_period = 'Année'
                      then array['Trimestre 1', 'Trimestre 2', 'Trimestre 3']
                      else array[v_period] end;

    select round(avg(g.general_avg), 2) into v_avg
    from public.ef_student_period_generals(v_class, v_periods, v_student) g;

    select count(*), coalesce(sum(n.score), 0), coalesce(sum(n.max_score), 0), count(*) filter (where n.is_absent)
      into v_cnt, v_sum, v_max, v_abs
    from public.notes n
    where n.student_id = v_student and n.class_section_id = v_class and n.period_label = any (v_periods);

    -- fingerprint of the key figures, computed here (the client cannot choose it)
    v_hash := encode(sha256(convert_to(
      concat_ws('|', v_student, v_class, v_type, v_period, coalesce(v_avg::text, '-'), v_cnt, v_sum, v_max, v_abs),
      'UTF8')), 'hex');

    select d.code into v_code
    from public.documents_emis d
    where d.student_id = v_student and d.class_section_id = v_class and d.doc_type = v_type
      and d.period_label = v_period and d.payload_hash = v_hash and d.revoked_at is null
    order by d.issued_at desc limit 1;

    if v_code is null then
      v_tries := 0;
      loop
        v_code := public.ef_new_document_code();
        v_check := case when v_avg is null then null
                        else encode(sha256(convert_to(v_code || ':' || to_char(v_avg, 'FM990.00'), 'UTF8')), 'hex') end;
        begin
          insert into public.documents_emis
            (code, school_id, student_id, class_section_id, doc_type, period_label, year_label,
             payload_hash, check_hash, issued_by, issued_at)
          values (v_code, v_school, v_student, v_class, v_type, v_period, v_year, v_hash, v_check, auth.uid(),
                  clock_timestamp());
          exit;
        exception when unique_violation then
          v_tries := v_tries + 1;
          if v_tries > 5 then raise; end if;
        end;
      end loop;
    end if;

    v_out := v_out || jsonb_build_object('student_id', v_student, 'code', v_code);
  end loop;

  return v_out;
end;
$$;
revoke all on function public.ef_issue_documents(jsonb) from public, anon;
grant execute on function public.ef_issue_documents(jsonb) to authenticated;

-- -------------------------------------------------------------- revoke ----
create or replace function public.ef_revoke_document(p_code text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  d public.documents_emis;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indiquez la raison (5 caractères minimum)' using errcode = '22023';
  end if;
  select * into d from public.documents_emis where code = upper(btrim(p_code));
  if not found then
    raise exception 'Document introuvable' using errcode = 'P0002';
  end if;
  if not (public.ef_is_super_admin() or public.ef_is_school_admin(d.school_id)) then
    raise exception 'Réservé à l''administration de l''école' using errcode = '42501';
  end if;
  update public.documents_emis
     set revoked_at = coalesce(revoked_at, now()),
         revoked_by = coalesce(revoked_by, auth.uid()),
         revoked_reason = coalesce(revoked_reason, btrim(p_reason))
   where id = d.id;
end;
$$;
revoke all on function public.ef_revoke_document(text, text) from public, anon;
grant execute on function public.ef_revoke_document(text, text) to authenticated;

-- -------------------------------------------------------------- verify ----
-- PUBLIC page backend. Executable by service_role ONLY (the edge function), never by anon/authenticated.
-- p_check (optional): the "moyenne générale" printed on the paper. Answers only match / mismatch.
create or replace function public.ef_verify_document(p_code text, p_check numeric default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  d record;
  v_initials text;
  v_super boolean;
  v_grade text := null;
begin
  if v_code !~ '^EF-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$' then
    return jsonb_build_object('status', 'unknown');
  end if;

  select d0.id, d0.doc_type, d0.period_label, d0.year_label, d0.issued_at, d0.revoked_at, d0.check_hash,
         d0.student_id, d0.class_section_id, d0.payload_hash, e.name as school_name, e.city as school_city
    into d
  from public.documents_emis d0
  join public.ecoles e on e.id = d0.school_id
  where d0.code = v_code;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;

  if d.revoked_at is not null then
    return jsonb_build_object(
      'status', 'revoked',
      'doc_type', d.doc_type,
      'school_name', d.school_name,
      'issued_on', d.issued_at::date,
      'revoked_on', d.revoked_at::date
    );
  end if;

  select upper(left(coalesce(nullif(btrim(p.first_name), ''), '?'), 1)) || '. ' ||
         upper(left(coalesce(nullif(btrim(p.last_name), ''), '?'), 1)) || '.'
    into v_initials
  from public.profils p where p.id = d.student_id;

  if p_check is not null and d.check_hash is not null then
    v_grade := case when d.check_hash =
      encode(sha256(convert_to(v_code || ':' || to_char(round(p_check, 2), 'FM990.00'), 'UTF8')), 'hex')
      then 'match' else 'mismatch' end;
  end if;

  update public.documents_emis
     set verified_count = verified_count + 1, last_verified_at = now()
   where id = d.id;

  return jsonb_build_object(
    'status', 'valid',
    'doc_type', d.doc_type,
    'period_label', d.period_label,
    'year_label', d.year_label,
    'school_name', d.school_name,
    'school_city', d.school_city,
    'holder_initials', coalesce(v_initials, '?'),
    'issued_on', d.issued_at::date,
    'superseded', exists (
      select 1 from public.documents_emis n
      where n.student_id = d.student_id and n.class_section_id is not distinct from d.class_section_id
        and n.doc_type = d.doc_type and n.period_label = d.period_label
        and n.revoked_at is null and n.issued_at > d.issued_at and n.payload_hash <> d.payload_hash
    ),
    'grade_check', v_grade
  );
end;
$$;
revoke all on function public.ef_verify_document(text, numeric) from public, anon, authenticated;
grant execute on function public.ef_verify_document(text, numeric) to service_role;
