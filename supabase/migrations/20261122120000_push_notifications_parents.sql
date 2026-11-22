-- Push notifications for parents.
--
-- Everything a student is told about their school life (grades, exercises, évaluations,
-- compositions, timetable changes, bulletins, the 18h reminder) is also sent to each of their
-- parents, whether or not the child has the app: « Awa · Nouvelle note ». Parents are also told
-- about absences and lateness (not the student), and receive their own messages and announcements.
--
-- A parent's copy remembers the child (child_id): the app opens that child's screen.

alter table public.ef_push_queue add column if not exists child_id uuid;
create index if not exists ef_push_queue_child on public.ef_push_queue (child_id) where child_id is not null;

-- what parents are told about their children
create or replace function public.ef_push_parent_kinds()
returns text[] language sql immutable as $$
  select array['note','exercice','rappel','evaluation','composition','edt','bulletin','absence'];
$$;

-- first name shown in front of a parent's notification
create or replace function public.ef_first_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select first_name from profils where id = p_user)), ''), 'Votre enfant');
$$;

-- A parent's copy: « Awa · » in front of the title, « Son bulletin » instead of « Ton bulletin ».
-- Also keeps the prefix when a trigger later rewrites the title of a waiting notification.
create or replace function public.ef_push_parent_copy()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefix text;
begin
  if new.child_id is null then return new; end if;
  v_prefix := ef_first_name(new.child_id) || ' · ';
  if left(new.title, length(v_prefix)) <> v_prefix then
    new.title := v_prefix || new.title;
  end if;
  new.body := regexp_replace(regexp_replace(new.body, '^Ton ', 'Son '), '^Tes ', 'Ses ');
  return new;
end $$;

drop trigger if exists ef_push_parent_copy on public.ef_push_queue;
create trigger ef_push_parent_copy before insert or update of title, body on public.ef_push_queue
  for each row execute function public.ef_push_parent_copy();

-- Queues a child's notification for each of their parents.
create or replace function public.ef_push_enqueue_parents(
  p_student uuid, p_kind text, p_title text, p_body text, p_screen text,
  p_ref text default null, p_delay interval default interval '2 minutes')
returns void language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  if p_student is null or not (p_kind = any(ef_push_parent_kinds())) then
    return;
  end if;
  for v_parent in select distinct l.parent_id from liens_parent_eleve l where l.student_id = p_student loop
    continue when not ef_push_wants(v_parent, p_kind);
    if p_ref is not null then
      update ef_push_queue set title = p_title, body = left(p_body, 240), screen = p_screen
       where ref = p_ref and user_id = v_parent and child_id = p_student and sent_at is null and cancelled_at is null;
      continue when found;
    end if;
    insert into ef_push_queue (user_id, child_id, kind, title, body, screen, ref, send_after)
    values (v_parent, p_student, p_kind, p_title, left(p_body, 240), p_screen, p_ref, now() + p_delay);
  end loop;
end $$;

-- Queue a notification (now also for the parents of a student).
create or replace function public.ef_push_enqueue(
  p_user uuid, p_kind text, p_title text, p_body text, p_screen text,
  p_ref text default null, p_delay interval default interval '2 minutes')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then
    return;
  end if;
  perform ef_push_enqueue_parents(p_user, p_kind, p_title, p_body, p_screen, p_ref, p_delay);
  if not ef_push_wants(p_user, p_kind) then
    return;
  end if;
  if p_ref is not null then
    update ef_push_queue set title = p_title, body = p_body, screen = p_screen
     where ref = p_ref and user_id = p_user and child_id is null and sent_at is null and cancelled_at is null;
    if found then return; end if;
  end if;
  insert into ef_push_queue (user_id, kind, title, body, screen, ref, send_after)
  values (p_user, p_kind, p_title, left(p_body, 240), p_screen, p_ref, now() + p_delay);
end $$;

revoke all on function public.ef_push_enqueue_parents(uuid, text, text, text, text, text, interval) from public, anon, authenticated;
revoke all on function public.ef_push_enqueue(uuid, text, text, text, text, text, interval) from public, anon, authenticated;
revoke all on function public.ef_first_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- absences and lateness (parents)

create or replace function public.ef_push_on_presence()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_line text; v_gender text;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('presence:' || old.id);
    return old;
  end if;
  -- corrected to present / excused before it was sent: nothing to say
  if new.status::text not in ('absent', 'late') then
    perform ef_push_cancel('presence:' || new.id);
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  v_line := case when new.subject_id is null then '' else ' en ' || ef_subject_name(new.subject_id) end
            || ' · ' || ef_fr_date(new.date);
  select gender into v_gender from profils where id = new.student_id;
  perform ef_push_enqueue_parents(new.student_id, 'absence',
    case when new.status::text = 'late' then 'Retard' else 'Absence' end,
    case when new.status::text = 'late' then 'En retard'
         when v_gender = 'F' then 'Absente' when v_gender = 'M' then 'Absent' else 'Absent(e)' end || v_line,
    'attendance', 'presence:' || new.id, interval '15 minutes');
  return new;
end $$;

drop trigger if exists ef_push_on_presence on public.presences;
create trigger ef_push_on_presence after insert or update of status or delete on public.presences
  for each row execute function public.ef_push_on_presence();

-- ---------------------------------------------------------------- messages and announcements (students and parents)

create or replace function public.ef_push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not exists (select 1 from roles_utilisateurs r where r.user_id = new.recipient_id
                   and r.role in ('student', 'parent') and r.active) then
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

-- ---------------------------------------------------------------- triggers that edit waiting notifications
-- (same as before, now also the parents' copies: child_id = the student)

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
         where ref = 'eval:' || new.id and (user_id = s or child_id = s) and sent_at is null and cancelled_at is null;
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
       where ref = 'cahier:' || new.id and (user_id = s or child_id = s) and sent_at is null and cancelled_at is null;
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
      if exists (select 1 from ef_push_queue where ref = 'edt-new:' || old.id and (user_id = s or child_id = s)
                   and sent_at is null and cancelled_at is null) then
        update ef_push_queue set cancelled_at = now()
         where ref = 'edt-new:' || old.id and (user_id = s or child_id = s) and sent_at is null and cancelled_at is null;
      else
        perform ef_push_enqueue(s, 'edt', 'Emploi du temps modifié', 'Cours retiré : ' || v_old,
          'timetable', 'edt:' || old.id, interval '5 minutes');
      end if;
    else
      if exists (select 1 from ef_push_queue where ref = 'edt-new:' || new.id and (user_id = s or child_id = s)
                   and sent_at is null and cancelled_at is null) then
        update ef_push_queue set body = 'Nouveau cours : ' || v_new
         where ref = 'edt-new:' || new.id and (user_id = s or child_id = s) and sent_at is null and cancelled_at is null;
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

