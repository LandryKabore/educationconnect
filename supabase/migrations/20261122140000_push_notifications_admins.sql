-- Push notifications for school administrators.
--
--   aconfirmer   a teacher proposed an évaluation: it waits for the administration's confirmation
--   bilan        17h30, school days: today's absences, lateness and lessons without an appel
--   periode      3 days before a Trimestre ends: évaluations still without grades
--   signalement  someone of the school reported a problem in the app
--   message, annonce  as for everyone else
--
-- Nothing is sent about what the administrator did themself.

-- the active administrators of a school
create or replace function public.ef_school_admins(p_school uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct user_id from roles_utilisateurs where role = 'school_admin' and active and school_id = p_school;
$$;
revoke all on function public.ef_school_admins(uuid) from public, anon, authenticated;

create or replace function public.ef_person_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') from profils where id = p_user;
$$;
revoke all on function public.ef_person_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- évaluation to confirm

create or replace function public.ef_push_on_evaluation_to_confirm()
returns trigger language plpgsql security definer set search_path = public as $$
declare a uuid; v_school uuid;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('eval-a:' || old.id);
    return old;
  end if;
  if new.admin_confirmed is true then
    perform ef_push_cancel('eval-a:' || new.id);
    return new;
  end if;
  -- only examens proposed by a teacher (composition papers belong to a session the school set)
  if new.type <> 'examen' or new.session_id is not null or new.teacher_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.admin_confirmed is not true
     and (new.eval_date, new.start_time, new.title) is not distinct from (old.eval_date, old.start_time, old.title) then
    return new;
  end if;
  select school_id into v_school from classes where id = new.class_section_id;
  for a in select ef_school_admins(v_school) loop
    continue when a = auth.uid();
    perform ef_push_enqueue(a, 'aconfirmer', 'Évaluation à confirmer',
      ef_subject_name(new.subject_id) || ' · ' || ef_class_name(new.class_section_id)
        || coalesce(' · ' || ef_fr_date(new.eval_date), '')
        || coalesce(' · ' || ef_person_name(new.teacher_id), ''),
      'schoolHomework', 'eval-a:' || new.id);
  end loop;
  return new;
end $$;

drop trigger if exists ef_push_on_evaluation_to_confirm on public.evaluations;
create trigger ef_push_on_evaluation_to_confirm after insert or update of admin_confirmed, eval_date, start_time, title or delete
  on public.evaluations for each row execute function public.ef_push_on_evaluation_to_confirm();

-- ---------------------------------------------------------------- problem reported in the app

create or replace function public.ef_push_on_signalement()
returns trigger language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  if new.school_id is null or nullif(trim(coalesce(new.message, '')), '') is null then
    return new;
  end if;
  for a in select ef_school_admins(new.school_id) loop
    continue when a = new.user_id;
    perform ef_push_enqueue(a, 'signalement', 'Nouveau signalement',
      coalesce(ef_person_name(new.user_id), 'Un utilisateur') || ' : ' || left(trim(new.message), 160),
      'signalements', 'sig:' || new.id, interval '0');
  end loop;
  return new;
end $$;

drop trigger if exists ef_push_on_signalement on public.signalements;
create trigger ef_push_on_signalement after insert on public.signalements
  for each row execute function public.ef_push_on_signalement();

-- ---------------------------------------------------------------- messages and announcements (everyone)

create or replace function public.ef_push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not exists (select 1 from roles_utilisateurs r where r.user_id = new.recipient_id
                   and r.role in ('student', 'parent', 'teacher', 'school_admin') and r.active) then
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

-- ---------------------------------------------------------------- end of day summary (17h30, school days)

create or replace function public.ef_push_admin_bilan()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  a uuid;
  today date := (now() at time zone 'Africa/Ouagadougou')::date;
  v_parts text[];
begin
  for r in
    with day as (
      select k.school_id, p.status::text as status, p.student_id
        from presences p join classes k on k.id = p.class_section_id
       where p.date = today
    ), lessons as (
      select k.school_id, count(*) as missing
        from creneaux_edt c join classes k on k.id = c.class_section_id
       where c.day_of_week = extract(isodow from today)::int and c.subject_id is not null
         and not exists (select 1 from presences p where p.date = today and p.class_section_id = c.class_section_id
                           and p.subject_id = c.subject_id)
         and not exists (select 1 from composition_sessions s where s.class_section_id = c.class_section_id
                           and today between s.starts_on and coalesce(s.ends_on, s.starts_on))
       group by k.school_id
    )
    -- only schools that took an appel today (open)
    select d.school_id,
           count(distinct d.student_id) filter (where d.status = 'absent') as absents,
           count(distinct d.student_id) filter (where d.status = 'late') as lates,
           coalesce((select missing from lessons l where l.school_id = d.school_id), 0) as missing
      from day d group by d.school_id
  loop
    v_parts := array[]::text[];
    v_parts := v_parts || (case when r.absents = 0 then 'aucun absent'
                                 else r.absents || ' élève' || case when r.absents > 1 then 's' else '' end
                                      || ' absent' || case when r.absents > 1 then 's' else '' end end);
    if r.lates > 0 then v_parts := v_parts || (r.lates || ' en retard'); end if;
    v_parts := v_parts || (case when r.missing = 0 then 'tous les appels faits'
                                 else r.missing || ' appel' || case when r.missing > 1 then 's' else '' end
                                      || ' non fait' || case when r.missing > 1 then 's' else '' end end);
    for a in select ef_school_admins(r.school_id) loop
      perform ef_push_enqueue(a, 'bilan', 'Bilan du jour', array_to_string(v_parts, ' · '),
        'schoolAttendance', 'bilan:' || r.school_id || ':' || today, interval '0');
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------- Trimestre ending in 3 days (8h)

create or replace function public.ef_push_admin_periode()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  a uuid;
  today date := (now() at time zone 'Africa/Ouagadougou')::date;
begin
  for r in
    select p.id, p.school_id, p.label, p.end_date,
           (select count(*) from evaluations e join classes k on k.id = e.class_section_id
             where k.school_id = p.school_id and e.type = 'examen' and e.period_label = p.label
               and e.eval_date <= today
               and (e.admin_confirmed is true or e.session_id is not null)
               and not exists (select 1 from notes n where n.evaluation_id = e.id)) as ungraded
      from periodes_scolaires p
     where p.end_date = today + 3 and coalesce(p.status, '') <> 'cloturee'
  loop
    for a in select ef_school_admins(r.school_id) loop
      perform ef_push_enqueue(a, 'periode', r.label || ' : fin ' || ef_fr_date(r.end_date),
        case when r.ungraded = 0 then 'Toutes les évaluations ont leurs notes. Les bulletins peuvent être préparés.'
             else r.ungraded || ' évaluation' || case when r.ungraded > 1 then 's' else '' end
                  || ' sans notes. Pensez à relancer les enseignants avant les bulletins.' end,
        'bulletins', 'periode:' || r.id, interval '0');
    end loop;
  end loop;
end $$;

revoke all on function public.ef_push_admin_bilan() from public, anon, authenticated;
revoke all on function public.ef_push_admin_periode() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('push-admin-bilan', 'push-admin-periode');
select cron.schedule('push-admin-bilan', '30 17 * * 1-6', 'select public.ef_push_admin_bilan()');
select cron.schedule('push-admin-periode', '0 8 * * *', 'select public.ef_push_admin_periode()');
