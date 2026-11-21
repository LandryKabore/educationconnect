-- Push notifications, first for students (22 Nov 2026).
--
--   * ef_push_tokens  : the iPhones signed in to an account (registered by the app).
--   * ef_push_prefs   : what each person turned off (or on, for the morning reminder) in Profil.
--   * ef_push_queue   : what to send. Triggers fill it; the edge function « envoyer-notifications »,
--                       called every minute by pg_cron, sends what is due to Apple.
--
-- Rules
--   * nothing is queued for someone with no phone registered, or who turned that kind off;
--   * grades wait 10 minutes, so a teacher's typo corrected in time never reaches the student
--     (the queued notification is updated or cancelled instead);
--   * nothing is sent between 21h and 6h (Ouagadougou time, UTC): it waits for the morning;
--   * several notifications of the same kind for the same person are sent as one
--     (« 3 nouvelles notes ») by the edge function.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- tables

create table if not exists public.ef_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios')),
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);
create index if not exists ef_push_tokens_user on public.ef_push_tokens (user_id);
alter table public.ef_push_tokens enable row level security;
-- no policy: the app goes through ef_register_push_token / ef_unregister_push_token

create table if not exists public.ef_push_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  enabled boolean not null,
  primary key (user_id, kind)
);
alter table public.ef_push_prefs enable row level security;
drop policy if exists ef_push_prefs_own on public.ef_push_prefs;
create policy ef_push_prefs_own on public.ef_push_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.ef_push_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  screen text,
  ref text,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ef_push_queue_due on public.ef_push_queue (send_after)
  where sent_at is null and cancelled_at is null;
create index if not exists ef_push_queue_ref on public.ef_push_queue (ref)
  where sent_at is null and cancelled_at is null;
alter table public.ef_push_queue enable row level security;
-- no policy: only triggers (security definer) and the edge function (service role) touch it

-- ---------------------------------------------------------------- phone registration

create or replace function public.ef_register_push_token(p_token text, p_environment text default 'production')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(length(p_token), 0) not between 32 and 200 then
    return;
  end if;
  -- a phone signed in to another account moves to this one
  insert into ef_push_tokens (token, user_id, environment, updated_at)
  values (p_token, auth.uid(), case when p_environment = 'sandbox' then 'sandbox' else 'production' end, now())
  on conflict (token) do update
    set user_id = excluded.user_id, environment = excluded.environment, updated_at = now();
end $$;

create or replace function public.ef_unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from ef_push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.ef_register_push_token(text, text) from public, anon;
revoke all on function public.ef_unregister_push_token(text) from public, anon;
grant execute on function public.ef_register_push_token(text, text) to authenticated;
grant execute on function public.ef_unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------- queue helpers

-- the morning reminder is off unless turned on; everything else is on unless turned off
create or replace function public.ef_push_wants(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ef_push_tokens t where t.user_id = p_user)
     and coalesce((select enabled from ef_push_prefs where user_id = p_user and kind = p_kind), p_kind <> 'matin');
$$;

-- Queue a notification. With a ref, a notification still waiting for the same thing is updated
-- instead (a corrected grade, a timetable slot edited twice).
create or replace function public.ef_push_enqueue(
  p_user uuid, p_kind text, p_title text, p_body text, p_screen text,
  p_ref text default null, p_delay interval default interval '2 minutes')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or not ef_push_wants(p_user, p_kind) then
    return;
  end if;
  if p_ref is not null then
    update ef_push_queue set title = p_title, body = p_body, screen = p_screen
     where ref = p_ref and user_id = p_user and sent_at is null and cancelled_at is null;
    if found then return; end if;
  end if;
  insert into ef_push_queue (user_id, kind, title, body, screen, ref, send_after)
  values (p_user, p_kind, p_title, left(p_body, 240), p_screen, p_ref, now() + p_delay);
end $$;

-- cancels what is still waiting; returns how many were cancelled
create or replace function public.ef_push_cancel(p_ref text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update ef_push_queue set cancelled_at = now()
   where ref = p_ref and sent_at is null and cancelled_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.ef_push_wants(uuid, text) from public, anon, authenticated;
revoke all on function public.ef_push_enqueue(uuid, text, text, text, text, text, interval) from public, anon, authenticated;
revoke all on function public.ef_push_cancel(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- French formatting

-- 7h, 7h30
create or replace function public.ef_fr_clock(t time)
returns text language sql immutable as $$
  select extract(hour from t)::int || 'h' ||
         case when extract(minute from t)::int > 0 then lpad(extract(minute from t)::int::text, 2, '0') else '' end;
$$;

create or replace function public.ef_fr_day(dow int)
returns text language sql immutable as $$
  select (array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[dow];
$$;

-- jeudi 27 novembre
create or replace function public.ef_fr_date(d date)
returns text language sql immutable as $$
  select public.ef_fr_day(extract(isodow from d)::int) || ' ' || extract(day from d)::int || ' ' ||
         (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[extract(month from d)::int];
$$;

-- 14 ; 12,5
create or replace function public.ef_fr_num(n numeric)
returns text language sql immutable as $$
  select replace(trim_scale(n)::text, '.', ',');
$$;

create or replace function public.ef_subject_name(p_subject uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from matieres where id = p_subject), 'un cours');
$$;

-- students enrolled in a class (the ones with an account get the notifications)
create or replace function public.ef_class_students(p_class uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct student_id from inscriptions where class_section_id = p_class and status = 'active';
$$;

-- ---------------------------------------------------------------- grades

create or replace function public.ef_push_on_note()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref text;
  v_eval text;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('note:' || old.id);
    return old;
  end if;
  v_ref := 'note:' || new.id;
  if new.score is null or coalesce(new.is_absent, false) then
    perform ef_push_cancel(v_ref);
    return new;
  end if;
  if tg_op = 'UPDATE' and new.score is not distinct from old.score
     and new.max_score is not distinct from old.max_score
     and new.is_absent is not distinct from old.is_absent then
    return new;
  end if;
  select title into v_eval from evaluations where id = new.evaluation_id;
  perform ef_push_enqueue(
    new.student_id, 'note',
    'Nouvelle note',
    ef_fr_num(new.score) || '/' || ef_fr_num(coalesce(new.max_score, 20)) || ' en ' || ef_subject_name(new.subject_id)
      || coalesce(' · ' || nullif(trim(v_eval), ''), ''),
    'grades', v_ref, interval '10 minutes');
  return new;
end $$;

drop trigger if exists ef_push_on_note on public.notes;
create trigger ef_push_on_note after insert or update or delete on public.notes
  for each row execute function public.ef_push_on_note();

-- ---------------------------------------------------------------- exercises and evaluations

create or replace function public.ef_push_on_evaluation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s uuid;
  v_subject text;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('eval:' || old.id);
    return old;
  end if;
  v_subject := ef_subject_name(new.subject_id);

  if new.type = 'devoir' then
    -- a new exercise; an edit only refreshes a notification not sent yet
    for s in select ef_class_students(new.class_section_id) loop
      if tg_op = 'INSERT' then
        perform ef_push_enqueue(s, 'exercice', 'Nouvel exercice de ' || v_subject,
          coalesce(nullif(trim(new.title), '') || ' · ', '') || 'à rendre ' || ef_fr_date(new.eval_date),
          'exercises', 'eval:' || new.id);
      else
        update ef_push_queue
           set body = coalesce(nullif(trim(new.title), '') || ' · ', '') || 'à rendre ' || ef_fr_date(new.eval_date)
         where ref = 'eval:' || new.id and user_id = s and sent_at is null and cancelled_at is null;
      end if;
    end loop;

  elsif new.type = 'examen' and new.admin_confirmed is true
        and (tg_op = 'INSERT' or old.admin_confirmed is not true) then
    -- an evaluation the administration has just confirmed
    for s in select ef_class_students(new.class_section_id) loop
      perform ef_push_enqueue(s, 'evaluation', 'Évaluation de ' || v_subject,
        coalesce(nullif(trim(new.title), '') || ' · ', '') || ef_fr_date(new.eval_date)
          || coalesce(', ' || ef_fr_clock(new.start_time), ''),
        'compositions', 'eval:' || new.id);
    end loop;

  elsif new.type = 'examen' and tg_op = 'UPDATE' and new.admin_confirmed is not true then
    perform ef_push_cancel('eval:' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists ef_push_on_evaluation on public.evaluations;
create trigger ef_push_on_evaluation after insert or update or delete on public.evaluations
  for each row execute function public.ef_push_on_evaluation();

-- homework written in the cahier de textes
create or replace function public.ef_push_on_cahier()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s uuid;
  v_body text;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('cahier:' || old.id);
    return old;
  end if;
  if nullif(trim(coalesce(new.homework, '')), '') is null then
    perform ef_push_cancel('cahier:' || new.id);
    return new;
  end if;
  if tg_op = 'UPDATE' and new.homework is not distinct from old.homework
     and new.homework_due is not distinct from old.homework_due then
    return new;
  end if;
  v_body := left(trim(new.homework), 120) || coalesce(' · à rendre ' || ef_fr_date(new.homework_due), '');
  for s in select ef_class_students(new.class_section_id) loop
    if tg_op = 'INSERT' or nullif(trim(coalesce(old.homework, '')), '') is null then
      perform ef_push_enqueue(s, 'exercice', 'Nouvel exercice de ' || ef_subject_name(new.subject_id),
        v_body, 'exercises', 'cahier:' || new.id);
    else
      update ef_push_queue set body = v_body
       where ref = 'cahier:' || new.id and user_id = s and sent_at is null and cancelled_at is null;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists ef_push_on_cahier on public.cahier_entrees;
create trigger ef_push_on_cahier after insert or update or delete on public.cahier_entrees
  for each row execute function public.ef_push_on_cahier();

-- ---------------------------------------------------------------- timetable

create or replace function public.ef_push_on_creneau()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s uuid;
  v_new text;
  v_old text;
  v_body text;
  v_class uuid;
begin
  if tg_op <> 'INSERT' then
    v_old := ef_subject_name(old.subject_id) || ', ' || ef_fr_day(old.day_of_week) || ' ' || ef_fr_clock(old.start_time);
  end if;
  if tg_op <> 'DELETE' then
    v_new := ef_subject_name(new.subject_id) || ', ' || ef_fr_day(new.day_of_week) || ' '
             || ef_fr_clock(new.start_time) || '–' || ef_fr_clock(new.end_time);
  end if;

  if tg_op = 'UPDATE' then
    if new.class_section_id is distinct from old.class_section_id then
      -- moved to another class: removed here, added there
      for s in select ef_class_students(old.class_section_id) loop
        perform ef_push_enqueue(s, 'edt', 'Emploi du temps modifié', 'Cours retiré : ' || v_old, 'timetable', 'edt:' || old.id || ':' || s, interval '5 minutes');
      end loop;
      for s in select ef_class_students(new.class_section_id) loop
        perform ef_push_enqueue(s, 'edt', 'Emploi du temps modifié', 'Nouveau cours : ' || v_new, 'timetable', 'edt:' || new.id || ':' || s, interval '5 minutes');
      end loop;
      return new;
    end if;
    if new.subject_id is not distinct from old.subject_id and new.day_of_week is not distinct from old.day_of_week
       and new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time
       and new.room is not distinct from old.room then
      return new;
    end if;
  end if;

  v_class := coalesce(new.class_section_id, old.class_section_id);
  for s in select ef_class_students(v_class) loop
    if tg_op = 'INSERT' then
      perform ef_push_enqueue(s, 'edt', 'Emploi du temps modifié', 'Nouveau cours : ' || v_new,
        'timetable', 'edt-new:' || new.id, interval '5 minutes');
    elsif tg_op = 'DELETE' then
      -- a slot added and removed before anything was sent: nothing to say
      if exists (select 1 from ef_push_queue where ref = 'edt-new:' || old.id and user_id = s
                   and sent_at is null and cancelled_at is null) then
        update ef_push_queue set cancelled_at = now()
         where ref = 'edt-new:' || old.id and user_id = s and sent_at is null and cancelled_at is null;
      else
        perform ef_push_enqueue(s, 'edt', 'Emploi du temps modifié', 'Cours retiré : ' || v_old,
          'timetable', 'edt:' || old.id, interval '5 minutes');
      end if;
    else
      if exists (select 1 from ef_push_queue where ref = 'edt-new:' || new.id and user_id = s
                   and sent_at is null and cancelled_at is null) then
        update ef_push_queue set body = 'Nouveau cours : ' || v_new
         where ref = 'edt-new:' || new.id and user_id = s and sent_at is null and cancelled_at is null;
      else
        if new.subject_id is not distinct from old.subject_id and new.day_of_week is not distinct from old.day_of_week
           and new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time then
          v_body := v_new || ' : salle ' || coalesce(nullif(trim(new.room), ''), 'non précisée');
        else
          v_body := v_old || ' → ' || ef_fr_day(new.day_of_week) || ' ' || ef_fr_clock(new.start_time) || '–' || ef_fr_clock(new.end_time)
                    || case when new.subject_id is distinct from old.subject_id then ' (' || ef_subject_name(new.subject_id) || ')' else '' end;
        end if;
        perform ef_push_enqueue(s, 'edt', 'Emploi du temps modifié', v_body, 'timetable', 'edt:' || new.id, interval '5 minutes');
      end if;
    end if;
  end loop;
  return coalesce(new, old);
end $$;

drop trigger if exists ef_push_on_creneau on public.creneaux_edt;
create trigger ef_push_on_creneau after insert or update or delete on public.creneaux_edt
  for each row execute function public.ef_push_on_creneau();

-- ---------------------------------------------------------------- compositions

create or replace function public.ef_push_on_composition()
returns trigger language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('compo:' || old.id);
    return old;
  end if;
  for s in select ef_class_students(new.class_section_id) loop
    perform ef_push_enqueue(s, 'composition',
      coalesce(nullif(trim(new.title), ''), 'Compositions du ' || coalesce(new.period_label, 'trimestre')),
      case when new.ends_on is null or new.ends_on = new.starts_on then 'Le ' || ef_fr_date(new.starts_on)
           else 'Du ' || ef_fr_date(new.starts_on) || ' au ' || ef_fr_date(new.ends_on) end,
      'compositions', 'compo:' || new.id);
  end loop;
  return new;
end $$;

drop trigger if exists ef_push_on_composition on public.composition_sessions;
create trigger ef_push_on_composition after insert or update of starts_on, ends_on, title or delete on public.composition_sessions
  for each row execute function public.ef_push_on_composition();

-- ---------------------------------------------------------------- report cards

create or replace function public.ef_push_on_period_closed()
returns trigger language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if new.status = 'cloturee' and old.status is distinct from 'cloturee' then
    for s in
      select distinct i.student_id
        from inscriptions i join classes c on c.id = i.class_section_id
       where c.school_id = new.school_id and i.status = 'active'
         and (new.academic_year_id is null or c.academic_year_id = new.academic_year_id)
    loop
      perform ef_push_enqueue(s, 'bulletin', 'Bulletin disponible',
        'Ton bulletin du ' || new.label || ' est disponible.', 'bulletin', 'bulletin:' || new.id);
    end loop;
  elsif new.status is distinct from 'cloturee' and old.status = 'cloturee' then
    perform ef_push_cancel('bulletin:' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists ef_push_on_period_closed on public.periodes_scolaires;
create trigger ef_push_on_period_closed after update of status on public.periodes_scolaires
  for each row execute function public.ef_push_on_period_closed();

-- ---------------------------------------------------------------- messages and announcements

create or replace function public.ef_push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  -- students for now
  if not exists (select 1 from roles_utilisateurs r where r.user_id = new.recipient_id and r.role = 'student' and r.active) then
    return new;
  end if;
  if new.is_announcement is true then
    perform ef_push_enqueue(new.recipient_id, 'annonce', 'Nouvelle annonce',
      coalesce(nullif(trim(new.subject), ''), left(new.body, 120)), 'announcements', null, interval '0');
    return new;
  end if;
  -- school administrators appear as « Administration », never by name
  select case
           when exists (select 1 from roles_utilisateurs r where r.user_id = new.sender_id and r.role = 'school_admin'
                          and r.active and r.school_id = new.school_id) then 'Administration'
           else nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
         end
    into v_from
    from profils p where p.id = new.sender_id;
  perform ef_push_enqueue(new.recipient_id, 'message', coalesce(v_from, 'Nouveau message'),
    coalesce(nullif(trim(new.subject), ''), left(new.body, 120)), 'messages', null, interval '0');
  return new;
end $$;

drop trigger if exists ef_push_on_message on public.messages;
create trigger ef_push_on_message after insert on public.messages
  for each row execute function public.ef_push_on_message();

-- ---------------------------------------------------------------- daily reminders

-- 18h: what is due tomorrow (exercises, homework, evaluations, compositions)
create or replace function public.ef_push_daily_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  tomorrow date := (now() at time zone 'Africa/Ouagadougou')::date + 1;
begin
  for r in
    select s.sid, e.id, 'Exercice de ' || ef_subject_name(e.subject_id) || coalesce(' : ' || nullif(trim(e.title), ''), '') as line
      from evaluations e cross join lateral ef_class_students(e.class_section_id) as s(sid)
     where e.type = 'devoir' and e.eval_date = tomorrow
    union all
    select s.sid, c.id, ef_subject_name(c.subject_id) || ' : ' || left(trim(c.homework), 80)
      from cahier_entrees c cross join lateral ef_class_students(c.class_section_id) as s(sid)
     where c.homework_due = tomorrow and nullif(trim(coalesce(c.homework, '')), '') is not null
    union all
    select s.sid, e.id, 'Évaluation de ' || ef_subject_name(e.subject_id) || coalesce(' à ' || ef_fr_clock(e.start_time), '')
      from evaluations e cross join lateral ef_class_students(e.class_section_id) as s(sid)
     where e.type = 'examen' and e.admin_confirmed is true and e.eval_date = tomorrow
    union all
    select s.sid, k.id, 'Début des compositions' || coalesce(' du ' || k.period_label, '')
      from composition_sessions k cross join lateral ef_class_students(k.class_section_id) as s(sid)
     where k.starts_on = tomorrow
  loop
    perform ef_push_enqueue(r.sid, 'rappel', 'Pour demain', r.line, 'exercises',
      'rappel:' || tomorrow || ':' || r.id, interval '0');
  end loop;
end $$;

-- 6h15, Monday to Saturday: today's classes (only for students who turned it on)
create or replace function public.ef_push_morning()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  today date := (now() at time zone 'Africa/Ouagadougou')::date;
begin
  for r in
    select i.student_id, count(*) as n,
           (array_agg(ef_fr_clock(c.start_time) || ' (' || ef_subject_name(c.subject_id) || ')' order by c.start_time))[1] as first
      from inscriptions i
      join creneaux_edt c on c.class_section_id = i.class_section_id
     where i.status = 'active' and c.day_of_week = extract(isodow from today)::int
       and exists (select 1 from ef_push_prefs p where p.user_id = i.student_id and p.kind = 'matin' and p.enabled)
     group by i.student_id
  loop
    perform ef_push_enqueue(r.student_id, 'matin', 'Aujourd''hui',
      r.n || ' cours, premier à ' || r.first,
      'timetable', 'matin:' || today, interval '0');
  end loop;
end $$;

revoke all on function public.ef_push_daily_reminders() from public, anon, authenticated;
revoke all on function public.ef_push_morning() from public, anon, authenticated;

-- ---------------------------------------------------------------- sending

-- Called by the edge function (service role): takes what is due, outside the quiet hours.
create or replace function public.ef_push_claim(p_limit integer default 500)
returns table (id uuid, user_id uuid, kind text, title text, body text, screen text)
language sql security definer set search_path = public as $$
  with due as (
    select q.id from ef_push_queue q
     where q.sent_at is null and q.cancelled_at is null and q.send_after <= now()
       and extract(hour from now() at time zone 'Africa/Ouagadougou') between 6 and 20
     order by q.created_at
     limit p_limit
     for update skip locked
  )
  update ef_push_queue q set sent_at = now()
    from due where q.id = due.id
  returning q.id, q.user_id, q.kind, q.title, q.body, q.screen;
$$;
revoke all on function public.ef_push_claim(integer) from public, anon, authenticated;
grant execute on function public.ef_push_claim(integer) to service_role;

-- The cron call carries a secret kept in the vault; the edge function checks it here.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron_secret');
  end if;
end $$;

create or replace function public.ef_push_check_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'push_cron_secret' and decrypted_secret = p_secret);
$$;
revoke all on function public.ef_push_check_secret(text) from public, anon, authenticated;
grant execute on function public.ef_push_check_secret(text) to service_role;

-- every minute, only when something is due
create or replace function public.ef_push_kick()
returns void language plpgsql security definer set search_path = public as $$
begin
  if extract(hour from now() at time zone 'Africa/Ouagadougou') not between 6 and 20 then return; end if;
  if not exists (select 1 from ef_push_queue where sent_at is null and cancelled_at is null and send_after <= now()) then
    return;
  end if;
  perform net.http_post(
    url := 'https://hbfjtsxzueftoiryzhxh.supabase.co/functions/v1/envoyer-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.ef_push_kick() from public, anon, authenticated;

-- old rows are removed after 30 days
create or replace function public.ef_push_purge()
returns void language sql security definer set search_path = public as $$
  delete from ef_push_queue where created_at < now() - interval '30 days';
$$;
revoke all on function public.ef_push_purge() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job
 where jobname in ('push-send', 'push-reminders', 'push-morning', 'push-purge');
select cron.schedule('push-send', '* * * * *', 'select public.ef_push_kick()');
select cron.schedule('push-reminders', '0 18 * * *', 'select public.ef_push_daily_reminders()');
select cron.schedule('push-morning', '15 6 * * 1-6', 'select public.ef_push_morning()');
select cron.schedule('push-purge', '30 3 * * *', 'select public.ef_push_purge()');
