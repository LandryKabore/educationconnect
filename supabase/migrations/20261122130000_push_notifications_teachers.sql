-- Push notifications for teachers.
--
--   edt           a lesson of theirs added, moved or removed by the administration
--   confirmation  the administration confirmed one of their évaluations
--   composition   compositions set for a class they teach
--   appel         10 minutes after a lesson, the appel was not taken (school days only)
--   saisie        3 days after an évaluation, no grade entered yet
--   matin         6h15: today's lessons (off unless turned on)
--   message, annonce  as for students and parents
--
-- Nothing is sent about what the teacher did themself.

create or replace function public.ef_class_name(p_class uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from classes where id = p_class), 'une classe');
$$;
revoke all on function public.ef_class_name(uuid) from public, anon, authenticated;

-- « Mathématiques · 4e A · mardi 7h »
create or replace function public.ef_teacher_slot(p_subject uuid, p_class uuid, p_dow int, p_start time)
returns text language sql stable security definer set search_path = public as $$
  select ef_subject_name(p_subject) || ' · ' || ef_class_name(p_class) || ' · ' || ef_fr_day(p_dow) || ' ' || ef_fr_clock(p_start);
$$;
revoke all on function public.ef_teacher_slot(uuid, uuid, int, time) from public, anon, authenticated;

-- ---------------------------------------------------------------- timetable

create or replace function public.ef_push_on_creneau_teacher()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old text; v_new text;
begin
  if tg_op <> 'INSERT' then v_old := ef_teacher_slot(old.subject_id, old.class_section_id, old.day_of_week, old.start_time); end if;
  if tg_op <> 'DELETE' then v_new := ef_teacher_slot(new.subject_id, new.class_section_id, new.day_of_week, new.start_time); end if;

  if tg_op = 'INSERT' then
    if new.teacher_id is not null and new.teacher_id is distinct from auth.uid() then
      perform ef_push_enqueue(new.teacher_id, 'edt', 'Emploi du temps modifié', 'Nouveau cours : ' || v_new,
        'timetable', 'edt-t-new:' || new.id, interval '5 minutes');
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.teacher_id is null or old.teacher_id = auth.uid() then return old; end if;
    -- added and removed before anything was sent: nothing to say
    update ef_push_queue set cancelled_at = now()
     where ref = 'edt-t-new:' || old.id and user_id = old.teacher_id and sent_at is null and cancelled_at is null;
    if found then return old; end if;
    perform ef_push_enqueue(old.teacher_id, 'edt', 'Emploi du temps modifié', 'Cours retiré : ' || v_old,
      'timetable', 'edt-t:' || old.id, interval '5 minutes');
    return old;
  end if;

  if (new.teacher_id, new.class_section_id, new.subject_id, new.day_of_week, new.start_time)
     is not distinct from (old.teacher_id, old.class_section_id, old.subject_id, old.day_of_week, old.start_time) then
    return new;
  end if;

  if new.teacher_id is distinct from old.teacher_id then
    -- given to another teacher
    if old.teacher_id is not null and old.teacher_id is distinct from auth.uid() then
      perform ef_push_enqueue(old.teacher_id, 'edt', 'Emploi du temps modifié', 'Cours retiré : ' || v_old,
        'timetable', 'edt-t:' || old.id, interval '5 minutes');
    end if;
    if new.teacher_id is not null and new.teacher_id is distinct from auth.uid() then
      perform ef_push_enqueue(new.teacher_id, 'edt', 'Emploi du temps modifié', 'Nouveau cours : ' || v_new,
        'timetable', 'edt-t-new:' || new.id, interval '5 minutes');
    end if;
    return new;
  end if;

  if new.teacher_id is null or new.teacher_id = auth.uid() then return new; end if;
  if exists (select 1 from ef_push_queue where ref = 'edt-t-new:' || new.id and user_id = new.teacher_id
               and sent_at is null and cancelled_at is null) then
    -- still waiting as « Nouveau cours »: just the new time
    perform ef_push_enqueue(new.teacher_id, 'edt', 'Emploi du temps modifié', 'Nouveau cours : ' || v_new,
      'timetable', 'edt-t-new:' || new.id, interval '5 minutes');
  else
    perform ef_push_enqueue(new.teacher_id, 'edt', 'Emploi du temps modifié',
      'Cours déplacé : ' || v_old || ' → ' || ef_fr_day(new.day_of_week) || ' ' || ef_fr_clock(new.start_time),
      'timetable', 'edt-t:' || new.id, interval '5 minutes');
  end if;
  return new;
end $$;

drop trigger if exists ef_push_on_creneau_teacher on public.creneaux_edt;
create trigger ef_push_on_creneau_teacher after insert or update or delete on public.creneaux_edt
  for each row execute function public.ef_push_on_creneau_teacher();

-- ---------------------------------------------------------------- évaluation confirmed

create or replace function public.ef_push_on_evaluation_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is null or new.teacher_id = auth.uid() then return new; end if;
  if new.admin_confirmed is true and old.admin_confirmed is not true then
    perform ef_push_enqueue(new.teacher_id, 'confirmation', 'Évaluation confirmée',
      ef_subject_name(new.subject_id) || ' · ' || ef_class_name(new.class_section_id)
        || coalesce(' · ' || nullif(trim(new.title), ''), '')
        || coalesce(' · ' || ef_fr_date(new.eval_date), ''),
      'teacherEvaluations', 'eval:' || new.id, interval '0');
  elsif new.admin_confirmed is not true and old.admin_confirmed is true then
    perform ef_push_cancel('eval:' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists ef_push_on_evaluation_confirmed on public.evaluations;
create trigger ef_push_on_evaluation_confirmed after update of admin_confirmed on public.evaluations
  for each row execute function public.ef_push_on_evaluation_confirmed();

-- ---------------------------------------------------------------- compositions

create or replace function public.ef_push_on_composition_teacher()
returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('compo-t:' || old.id);
    return old;
  end if;
  for t in select distinct a.teacher_id from affectations_enseignement a
            where a.class_section_id = new.class_section_id and a.teacher_id is distinct from auth.uid() loop
    perform ef_push_enqueue(t, 'composition',
      coalesce(nullif(trim(new.title), ''), 'Compositions du ' || coalesce(new.period_label, 'trimestre')),
      ef_class_name(new.class_section_id) || ' · ' ||
      case when new.ends_on is null or new.ends_on = new.starts_on then 'le ' || ef_fr_date(new.starts_on)
           else 'du ' || ef_fr_date(new.starts_on) || ' au ' || ef_fr_date(new.ends_on) end,
      'timetable', 'compo-t:' || new.id);
  end loop;
  return new;
end $$;

drop trigger if exists ef_push_on_composition_teacher on public.composition_sessions;
create trigger ef_push_on_composition_teacher after insert or update of starts_on, ends_on, title or delete on public.composition_sessions
  for each row execute function public.ef_push_on_composition_teacher();

-- ---------------------------------------------------------------- messages and announcements (students, parents, teachers)

create or replace function public.ef_push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not exists (select 1 from roles_utilisateurs r where r.user_id = new.recipient_id
                   and r.role in ('student', 'parent', 'teacher') and r.active) then
    return new;
  end if;
  if new.is_announcement is true then
    perform ef_push_enqueue(new.recipient_id, 'annonce', 'Nouvelle annonce',
      coalesce(nullif(trim(new.subject), ''), left(new.body, 120)), 'announcements', 'msg:' || new.id, interval '0');
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
    coalesce(nullif(trim(new.subject), ''), left(new.body, 120)), 'messages', 'msg:' || new.id, interval '0');
  return new;
end $$;

-- ---------------------------------------------------------------- appel not taken (every 10 minutes)

-- Only on days the school is open (someone took an appel there today) and outside compositions.
create or replace function public.ef_push_teacher_appel()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  today date := (now() at time zone 'Africa/Ouagadougou')::date;
  nowt time := (now() at time zone 'Africa/Ouagadougou')::time;
begin
  for r in
    with open_schools as (
      select distinct k.school_id from presences p join classes k on k.id = p.class_section_id where p.date = today
    )
    select c.teacher_id, c.class_section_id, c.subject_id, c.start_time, c.end_time,
           'appel:' || c.class_section_id || ':' || c.subject_id || ':' || today as ref
      from creneaux_edt c
      join classes k on k.id = c.class_section_id
      join open_schools o on o.school_id = k.school_id
     where c.teacher_id is not null and c.subject_id is not null
       and c.day_of_week = extract(isodow from today)::int
       and c.end_time + interval '10 minutes' <= nowt
       and c.end_time + interval '2 hours' > nowt
       and not exists (select 1 from presences p where p.date = today and p.class_section_id = c.class_section_id
                         and p.subject_id = c.subject_id)
       and not exists (select 1 from composition_sessions s where s.class_section_id = c.class_section_id
                         and today between s.starts_on and coalesce(s.ends_on, s.starts_on))
       and not exists (select 1 from ef_push_queue q where q.ref = 'appel:' || c.class_section_id || ':' || c.subject_id || ':' || today
                         and q.user_id = c.teacher_id)
  loop
    perform ef_push_enqueue(r.teacher_id, 'appel', 'Appel non fait',
      ef_subject_name(r.subject_id) || ' · ' || ef_class_name(r.class_section_id) || ' · '
        || ef_fr_clock(r.start_time) || '–' || ef_fr_clock(r.end_time),
      'teacherAttendance', r.ref, interval '0');
  end loop;
end $$;

-- ---------------------------------------------------------------- grades to enter (18h)

create or replace function public.ef_push_teacher_daily()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  today date := (now() at time zone 'Africa/Ouagadougou')::date;
begin
  for r in
    select e.id, e.teacher_id, e.subject_id, e.class_section_id, e.title, e.eval_date
      from evaluations e
     where e.type = 'examen' and e.teacher_id is not null
       and (e.admin_confirmed is true or e.session_id is not null)
       and e.eval_date = today - 3
       and not exists (select 1 from notes n where n.evaluation_id = e.id)
  loop
    perform ef_push_enqueue(r.teacher_id, 'saisie', 'Notes à saisir',
      ef_subject_name(r.subject_id) || ' · ' || ef_class_name(r.class_section_id)
        || coalesce(' · ' || nullif(trim(r.title), ''), '') || ' du ' || ef_fr_date(r.eval_date),
      'teacherEvaluations', 'saisie:' || r.id, interval '0');
  end loop;
end $$;

-- ---------------------------------------------------------------- morning summary (6h15, only when turned on)

create or replace function public.ef_push_morning_teachers()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  today date := (now() at time zone 'Africa/Ouagadougou')::date;
begin
  for r in
    select c.teacher_id, count(*) as n,
           (array_agg(ef_fr_clock(c.start_time) || ' (' || ef_subject_name(c.subject_id) || ' · ' || ef_class_name(c.class_section_id) || ')'
                      order by c.start_time))[1] as first
      from creneaux_edt c
     where c.teacher_id is not null and c.day_of_week = extract(isodow from today)::int
       and exists (select 1 from ef_push_prefs p where p.user_id = c.teacher_id and p.kind = 'matin' and p.enabled)
     group by c.teacher_id
  loop
    perform ef_push_enqueue(r.teacher_id, 'matin', 'Aujourd''hui',
      r.n || ' cours, premier à ' || r.first, 'timetable', 'matin:' || today, interval '0');
  end loop;
end $$;

revoke all on function public.ef_push_teacher_appel() from public, anon, authenticated;
revoke all on function public.ef_push_teacher_daily() from public, anon, authenticated;
revoke all on function public.ef_push_morning_teachers() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job
 where jobname in ('push-teacher-appel', 'push-teacher-daily', 'push-morning-teachers');
select cron.schedule('push-teacher-appel', '*/10 7-19 * * 1-6', 'select public.ef_push_teacher_appel()');
select cron.schedule('push-teacher-daily', '0 18 * * *', 'select public.ef_push_teacher_daily()');
select cron.schedule('push-morning-teachers', '15 6 * * 1-6', 'select public.ef_push_morning_teachers()');
