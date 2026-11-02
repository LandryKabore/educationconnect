-- Idea 20 (1/2): close a period, lock its grades, keep a history of grade changes.
-- Proposal prepared 1 Nov 2026. NOT applied to any live database.
--
--  * periodes_scolaires        : one row per (academic year, period label) once a school
--                                closes it or sets its dates. No row = period is open.
--  * periodes_scolaires_log    : who closed / reopened / changed dates, and why.
--  * triggers on notes + evaluations : refuse insert / update / delete in a closed period.
--      - SQL / service role (auth.uid() is null) is not blocked (same rule as the other guards).
--      - Cascade deletes (class / student / evaluation removed) are not blocked
--        (pg_trigger_depth() > 1), otherwise a school could never delete a class.
--  * notes_historique          : old / new score for every update or delete of a grade
--                                (filled by trigger, nobody can write to it directly).
--  * RPCs: ef_close_period, ef_reopen_period, ef_set_period_dates,
--          ef_period_bounds_for_year, ef_period_bounds, ef_period_close_summary.
-- Existing RLS policies are not touched.

-- =========================================================== tables =========
create table if not exists public.periodes_scolaires (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.ecoles(id) on delete cascade,
  academic_year_id uuid not null references public.annees_scolaires(id) on delete cascade,
  label            text not null check (char_length(btrim(label)) between 1 and 60),
  status           text not null default 'ouverte' check (status in ('ouverte', 'cloturee')),
  start_date       date,
  end_date         date,
  closed_at        timestamptz,
  closed_by        uuid references public.profils(id) on delete set null,
  reopened_at      timestamptz,
  reopened_by      uuid references public.profils(id) on delete set null,
  reopen_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint periodes_scolaires_unique unique (academic_year_id, label),
  constraint periodes_scolaires_dates check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists periodes_scolaires_school_idx on public.periodes_scolaires (school_id);

create table if not exists public.periodes_scolaires_log (
  id         uuid primary key default gen_random_uuid(),
  period_id  uuid not null references public.periodes_scolaires(id) on delete cascade,
  school_id  uuid not null,
  action     text not null check (action in ('close', 'reopen', 'dates')),
  actor_id   uuid,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists periodes_scolaires_log_period_idx on public.periodes_scolaires_log (period_id, created_at desc);

-- No foreign keys on purpose: history must survive the deletion of a class or a student.
create table if not exists public.notes_historique (
  id               uuid primary key default gen_random_uuid(),
  note_id          uuid not null,
  evaluation_id    uuid,
  student_id       uuid not null,
  class_section_id uuid not null,
  subject_id       uuid not null,
  period_label     text not null,
  action           text not null check (action in ('update', 'delete')),
  old_score        numeric,
  new_score        numeric,
  old_max_score    numeric,
  new_max_score    numeric,
  old_is_absent    boolean,
  new_is_absent    boolean,
  changed_by       uuid,
  changed_at       timestamptz not null default now(),
  reason           text
);
create index if not exists notes_historique_class_subject_idx
  on public.notes_historique (class_section_id, subject_id, changed_at desc);
create index if not exists notes_historique_note_idx on public.notes_historique (note_id, changed_at desc);
create index if not exists notes_historique_student_idx on public.notes_historique (student_id, changed_at desc);

-- ============================================================ RLS ===========
alter table public.periodes_scolaires     enable row level security;
alter table public.periodes_scolaires_log enable row level security;
alter table public.notes_historique       enable row level security;

revoke all on public.periodes_scolaires, public.periodes_scolaires_log, public.notes_historique from anon, authenticated;
grant select on public.periodes_scolaires, public.periodes_scolaires_log, public.notes_historique to authenticated;

-- Everybody of the school can see whether a period is closed. Nobody writes directly (RPCs only).
drop policy if exists ef_periodes_select on public.periodes_scolaires;
create policy ef_periodes_select on public.periodes_scolaires for select to authenticated
  using (
    (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
    or school_id in (select public.ef_user_school_ids())
  );

drop policy if exists ef_periodes_log_select on public.periodes_scolaires_log;
create policy ef_periodes_log_select on public.periodes_scolaires_log for select to authenticated
  using (
    (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
  );

-- History: super admin, admin of the class's school, teachers of that class AND subject.
-- Students and parents never see it.
drop policy if exists ef_notes_historique_select on public.notes_historique;
create policy ef_notes_historique_select on public.notes_historique for select to authenticated
  using (
    (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or (class_section_id, subject_id) in (
      select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p
    )
  );

-- ======================================================= period helpers =====
-- Default dates when a school has not typed them: 3 equal slices of the school year.
-- Label "Année" (or any custom label) = the whole year.
-- ef_period_bounds_core / ef_period_bounds are INTERNAL (used by other SECURITY DEFINER
-- functions that already checked access): not executable by anon or authenticated.
create or replace function public.ef_period_bounds_core(p_academic_year_id uuid, p_label text)
returns table (start_date date, end_date date, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  p record;
  n int;
  len int;
begin
  select y.start_date, y.end_date into a
  from public.annees_scolaires y where y.id = p_academic_year_id;
  if not found then
    return;
  end if;

  select ps.start_date, ps.end_date into p
  from public.periodes_scolaires ps
  where ps.academic_year_id = p_academic_year_id and ps.label = btrim(p_label);
  if found and p.start_date is not null and p.end_date is not null then
    return query select p.start_date, p.end_date, 'ecole'::text;
    return;
  end if;

  n := case btrim(p_label)
         when 'Trimestre 1' then 1
         when 'Trimestre 2' then 2
         when 'Trimestre 3' then 3
         else 0 end;
  if n = 0 then
    return query select a.start_date, a.end_date, 'annee'::text;
    return;
  end if;
  len := (a.end_date - a.start_date) + 1;
  return query select
    (a.start_date + ((n - 1) * len) / 3)::date,
    case when n = 3 then a.end_date else (a.start_date + (n * len) / 3 - 1)::date end,
    'defaut'::text;
end;
$$;
revoke all on function public.ef_period_bounds_core(uuid, text) from public, anon, authenticated;

create or replace function public.ef_period_bounds(p_class_section_id uuid, p_label text)
returns table (start_date date, end_date date, source text)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_date, b.end_date, b.source
  from public.classes c
  cross join lateral public.ef_period_bounds_core(c.academic_year_id, p_label) b
  where c.id = p_class_section_id;
$$;
revoke all on function public.ef_period_bounds(uuid, text) from public, anon, authenticated;

-- Public wrapper (used by the "Clôturer" screen to pre-fill the dates): members of the school only.
create or replace function public.ef_period_bounds_for_year(p_academic_year_id uuid, p_label text)
returns table (start_date date, end_date date, source text)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_date, b.end_date, b.source
  from public.annees_scolaires y
  cross join lateral public.ef_period_bounds_core(y.id, p_label) b
  where y.id = p_academic_year_id
    and (public.ef_is_super_admin()
         or y.school_id in (select public.ef_my_admin_school_ids())
         or y.school_id in (select public.ef_user_school_ids()));
$$;
revoke all on function public.ef_period_bounds_for_year(uuid, text) from public, anon;
grant execute on function public.ef_period_bounds_for_year(uuid, text) to authenticated;

create or replace function public.ef_period_is_closed(p_class_section_id uuid, p_label text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    join public.periodes_scolaires p
      on p.academic_year_id = c.academic_year_id and p.label = p_label
    where c.id = p_class_section_id and p.status = 'cloturee'
  );
$$;
revoke all on function public.ef_period_is_closed(uuid, text) from public, anon;
grant execute on function public.ef_period_is_closed(uuid, text) to authenticated, service_role;

-- ===================================================== lock trigger =========
create or replace function public.ef_guard_period_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- cascade from a deleted class / student / evaluation, or server-side code: not blocked
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and public.ef_period_is_closed(old.class_section_id, old.period_label) then
    raise exception 'Période clôturée : « % » ne peut plus être modifiée. Demandez à l''administration de rouvrir la période.', old.period_label
      using errcode = 'P0001', hint = 'PERIOD_CLOSED';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and public.ef_period_is_closed(new.class_section_id, new.period_label) then
    raise exception 'Période clôturée : « % » ne peut plus être modifiée. Demandez à l''administration de rouvrir la période.', new.period_label
      using errcode = 'P0001', hint = 'PERIOD_CLOSED';
  end if;
  return coalesce(new, old);
end;
$$;

-- a trigger function is only checked at CREATE TRIGGER time, so nobody needs EXECUTE on it
revoke all on function public.ef_guard_period_lock() from public, anon, authenticated;

drop trigger if exists trg_notes_period_lock on public.notes;
create trigger trg_notes_period_lock
  before insert or update or delete on public.notes
  for each row execute function public.ef_guard_period_lock();

drop trigger if exists trg_evaluations_period_lock on public.evaluations;
create trigger trg_evaluations_period_lock
  before insert or update or delete on public.evaluations
  for each row execute function public.ef_guard_period_lock();

-- ===================================================== history triggers =====
create or replace function public.ef_log_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(current_setting('ef.change_reason', true)), '');
begin
  if tg_op = 'UPDATE' then
    insert into public.notes_historique (
      note_id, evaluation_id, student_id, class_section_id, subject_id, period_label, action,
      old_score, new_score, old_max_score, new_max_score, old_is_absent, new_is_absent,
      changed_by, reason)
    values (
      old.id, old.evaluation_id, old.student_id, old.class_section_id, old.subject_id, old.period_label, 'update',
      old.score, new.score, old.max_score, new.max_score, old.is_absent, new.is_absent,
      auth.uid(), v_reason);
    return new;
  end if;

  -- DELETE: skip cascades (class / student / evaluation deleted) to avoid mass history rows
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  insert into public.notes_historique (
    note_id, evaluation_id, student_id, class_section_id, subject_id, period_label, action,
    old_score, new_score, old_max_score, new_max_score, old_is_absent, new_is_absent,
    changed_by, reason)
  values (
    old.id, old.evaluation_id, old.student_id, old.class_section_id, old.subject_id, old.period_label, 'delete',
    old.score, null, old.max_score, null, old.is_absent, null,
    auth.uid(), v_reason);
  return old;
end;
$$;
revoke all on function public.ef_log_note_change() from public, anon, authenticated;

drop trigger if exists trg_notes_history_update on public.notes;
create trigger trg_notes_history_update
  after update on public.notes
  for each row
  when (old.score is distinct from new.score
     or old.max_score is distinct from new.max_score
     or old.is_absent is distinct from new.is_absent)
  execute function public.ef_log_note_change();

drop trigger if exists trg_notes_history_delete on public.notes;
create trigger trg_notes_history_delete
  after delete on public.notes
  for each row execute function public.ef_log_note_change();

-- ======================================================== RPCs ==============
create or replace function public.ef_assert_period_admin(p_school_id uuid, p_academic_year_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if not (public.ef_is_super_admin() or public.ef_is_school_admin(p_school_id)) then
    raise exception 'Réservé à l''administration de l''école' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.annees_scolaires y
    where y.id = p_academic_year_id and y.school_id = p_school_id
  ) then
    raise exception 'Année scolaire introuvable pour cette école' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.ef_assert_period_admin(uuid, uuid) from public, anon, authenticated;

create or replace function public.ef_close_period(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_label text,
  p_start date default null,
  p_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(p_label);
  v_row public.periodes_scolaires;
begin
  perform public.ef_assert_period_admin(p_school_id, p_academic_year_id);
  if v_label is null or v_label = '' or v_label = 'Année' then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'La date de fin est avant la date de début' using errcode = '22023';
  end if;

  insert into public.periodes_scolaires as ps
    (school_id, academic_year_id, label, status, start_date, end_date, closed_at, closed_by)
  values
    (p_school_id, p_academic_year_id, v_label, 'cloturee', p_start, p_end, now(), auth.uid())
  on conflict (academic_year_id, label) do update
    set status     = 'cloturee',
        start_date = coalesce(excluded.start_date, ps.start_date),
        end_date   = coalesce(excluded.end_date, ps.end_date),
        closed_at  = case when ps.status = 'cloturee' then ps.closed_at else now() end,
        closed_by  = case when ps.status = 'cloturee' then ps.closed_by else auth.uid() end,
        updated_at = now()
  returning * into v_row;

  insert into public.periodes_scolaires_log (period_id, school_id, action, actor_id)
  values (v_row.id, p_school_id, 'close', auth.uid());

  return to_jsonb(v_row);
end;
$$;

create or replace function public.ef_reopen_period(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_label text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(p_label);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row public.periodes_scolaires;
begin
  perform public.ef_assert_period_admin(p_school_id, p_academic_year_id);
  if char_length(v_reason) < 5 then
    raise exception 'Indiquez la raison de la réouverture (5 caractères minimum)' using errcode = '22023';
  end if;

  update public.periodes_scolaires ps
     set status = 'ouverte', reopened_at = now(), reopened_by = auth.uid(),
         reopen_reason = v_reason, updated_at = now()
   where ps.academic_year_id = p_academic_year_id and ps.label = v_label and ps.status = 'cloturee'
  returning * into v_row;
  if not found then
    raise exception 'Cette période n''est pas clôturée' using errcode = 'P0002';
  end if;

  insert into public.periodes_scolaires_log (period_id, school_id, action, actor_id, reason)
  values (v_row.id, p_school_id, 'reopen', auth.uid(), v_reason);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.ef_set_period_dates(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_label text,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(p_label);
  v_row public.periodes_scolaires;
begin
  perform public.ef_assert_period_admin(p_school_id, p_academic_year_id);
  if v_label is null or v_label = '' or v_label = 'Année' then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Dates invalides' using errcode = '22023';
  end if;

  insert into public.periodes_scolaires as ps (school_id, academic_year_id, label, start_date, end_date)
  values (p_school_id, p_academic_year_id, v_label, p_start, p_end)
  on conflict (academic_year_id, label) do update
    set start_date = excluded.start_date, end_date = excluded.end_date, updated_at = now()
  returning * into v_row;

  insert into public.periodes_scolaires_log (period_id, school_id, action, actor_id)
  values (v_row.id, p_school_id, 'dates', auth.uid());

  return to_jsonb(v_row);
end;
$$;

-- Numbers shown in the "Clôturer" confirmation: nothing is changed.
create or replace function public.ef_period_close_summary(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_label text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_label text := btrim(p_label);
  v_classes int;
  v_classes_with_notes int;
  v_notes int;
  v_evals int;
  v_invalid int;
begin
  perform public.ef_assert_period_admin(p_school_id, p_academic_year_id);

  select count(*) into v_classes
  from public.classes c where c.school_id = p_school_id and c.academic_year_id = p_academic_year_id;

  select count(*), count(distinct n.class_section_id),
         count(*) filter (where not (n.max_score > 0 and n.score >= 0 and n.score <= n.max_score))
    into v_notes, v_classes_with_notes, v_invalid
  from public.notes n
  join public.classes c on c.id = n.class_section_id
  where c.school_id = p_school_id and c.academic_year_id = p_academic_year_id and n.period_label = v_label;

  select count(*) into v_evals
  from public.evaluations e
  join public.classes c on c.id = e.class_section_id
  where c.school_id = p_school_id and c.academic_year_id = p_academic_year_id and e.period_label = v_label;

  return jsonb_build_object(
    'classes', v_classes,
    'classes_with_notes', v_classes_with_notes,
    'classes_without_notes', greatest(v_classes - v_classes_with_notes, 0),
    'notes', v_notes,
    'evaluations', v_evals,
    'invalid_notes', v_invalid
  );
end;
$$;

revoke all on function public.ef_close_period(uuid, uuid, text, date, date) from public, anon;
revoke all on function public.ef_reopen_period(uuid, uuid, text, text) from public, anon;
revoke all on function public.ef_set_period_dates(uuid, uuid, text, date, date) from public, anon;
revoke all on function public.ef_period_close_summary(uuid, uuid, text) from public, anon;
grant execute on function public.ef_close_period(uuid, uuid, text, date, date) to authenticated;
grant execute on function public.ef_reopen_period(uuid, uuid, text, text) to authenticated;
grant execute on function public.ef_set_period_dates(uuid, uuid, text, date, date) to authenticated;
grant execute on function public.ef_period_close_summary(uuid, uuid, text) to authenticated;
