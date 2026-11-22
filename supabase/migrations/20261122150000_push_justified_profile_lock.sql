-- 1. Parents are told when an absence or a lateness is justified (« Absence justifiée »), with
--    the reason the school wrote. A parent is never told about what they did themself.
-- 2. Profile: a person edits only their sex (and photo) themself. Name, phone, date of birth and
--    address can be filled once when empty (profile completion); after that only the school
--    (or a super admin) changes them.

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
    continue when v_parent = auth.uid() or not ef_push_wants(v_parent, p_kind);
    if p_ref is not null then
      update ef_push_queue set title = p_title, body = left(p_body, 240), screen = p_screen
       where ref = p_ref and user_id = v_parent and child_id = p_student and sent_at is null and cancelled_at is null;
      continue when found;
    end if;
    insert into ef_push_queue (user_id, child_id, kind, title, body, screen, ref, send_after)
    values (v_parent, p_student, p_kind, p_title, left(p_body, 240), p_screen, p_ref, now() + p_delay);
  end loop;
end $$;

create or replace function public.ef_push_on_presence()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_line text; v_gender text; v_was_late boolean;
begin
  if tg_op = 'DELETE' then
    perform ef_push_cancel('presence:' || old.id);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  v_line := case when new.subject_id is null then '' else ' en ' || ef_subject_name(new.subject_id) end
            || ' · ' || ef_fr_date(new.date);

  -- justified: replaces the absence notice if it is still waiting
  if new.status::text = 'excused' then
    v_was_late := tg_op = 'UPDATE' and old.status::text = 'late';
    perform ef_push_enqueue_parents(new.student_id, 'absence',
      case when v_was_late then 'Retard justifié' else 'Absence justifiée' end,
      case when v_was_late then 'Retard' else 'Absence' end || v_line
        || coalesce(' · ' || nullif(trim(new.note), ''), ''),
      'attendance', 'presence:' || new.id, interval '2 minutes');
    return new;
  end if;

  -- corrected to present before it was sent: nothing to say
  if new.status::text not in ('absent', 'late') then
    perform ef_push_cancel('presence:' || new.id);
    return new;
  end if;
  select gender into v_gender from profils where id = new.student_id;
  perform ef_push_enqueue_parents(new.student_id, 'absence',
    case when new.status::text = 'late' then 'Retard' else 'Absence' end,
    case when new.status::text = 'late' then 'En retard'
         when v_gender = 'F' then 'Absente' when v_gender = 'M' then 'Absent' else 'Absent(e)' end || v_line,
    'attendance', 'presence:' || new.id, interval '15 minutes');
  return new;
end $$;

-- Profiles: on one's own profile, filled details stay as they are (except sex, photo, last login).
create or replace function public.ef_guard_profils_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.ef_is_super_admin() then
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.email := old.email;
  new.matricule := old.matricule;
  new.active := old.active;
  new.family_managed := old.family_managed;
  new.must_change_password := old.must_change_password;
  if auth.uid() = old.id then
    if nullif(trim(coalesce(old.first_name, '')), '') is not null then new.first_name := old.first_name; end if;
    if nullif(trim(coalesce(old.last_name, '')), '') is not null then new.last_name := old.last_name; end if;
    if nullif(trim(coalesce(old.phone, '')), '') is not null then new.phone := old.phone; end if;
    if nullif(trim(coalesce(old.address, '')), '') is not null then new.address := old.address; end if;
    if old.date_of_birth is not null then new.date_of_birth := old.date_of_birth; end if;
  end if;
  return new;
end $$;
