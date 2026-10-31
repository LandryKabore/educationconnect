-- Security hardening 1/6: school-scoped SECURITY DEFINER helpers.
--
-- Background: ef_is_school_admin() with no argument returned true for an admin
-- of ANY school, and every unscoped call in an RLS policy therefore gave a
-- school admin read/write access to every other school (F-01, F-04, F-06,
-- F-07, B1/B2 of student-parent.md, T-14 of teacher.md).  The helpers below let
-- policies bind a check to the school that owns the row.
--
-- These functions only ADD helpers; no existing behaviour changes in this
-- migration.  They are SECURITY DEFINER (like the existing ef_* helpers) so
-- they can read roles/classes/inscriptions without recursing into RLS.

create or replace function public.ef_try_uuid(_value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return _value::uuid;
exception when others then
  return null;
end;
$$;

-- Active school_admin of the school that owns this class.
create or replace function public.ef_is_school_admin_of_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    join public.roles_utilisateurs r on r.school_id = c.school_id
    where c.id = _class_id
      and r.user_id = auth.uid()
      and r.role = 'school_admin'
      and r.active = true
  );
$$;

-- Active school_admin of a school in which the target user has a (non
-- super_admin) role, active or not (locked users must stay manageable).
create or replace function public.ef_is_school_admin_of_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles_utilisateurs adm
    join public.roles_utilisateurs tgt on tgt.school_id = adm.school_id
    where adm.user_id = auth.uid()
      and adm.role = 'school_admin'
      and adm.active = true
      and adm.school_id is not null
      and tgt.user_id = _user_id
      and tgt.role <> 'super_admin'
  );
$$;

-- The user has an active role in the given school.
create or replace function public.ef_user_in_school(_user_id uuid, _school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _school_id is not null and exists (
    select 1 from public.roles_utilisateurs r
    where r.user_id = _user_id
      and r.school_id = _school_id
      and r.active = true
  );
$$;

-- Caller teaches this subject in this class.
create or replace function public.ef_user_teaches_class_subject(_class_id uuid, _subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.affectations_enseignement a
    where a.class_section_id = _class_id
      and a.subject_id = _subject_id
      and a.teacher_id = auth.uid()
  );
$$;

-- The student has (or had) an inscription in this class.
create or replace function public.ef_student_in_class(_student_id uuid, _class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inscriptions i
    where i.student_id = _student_id
      and i.class_section_id = _class_id
  );
$$;

-- Subject and class belong to the same school.
create or replace function public.ef_subject_in_class_school(_class_id uuid, _subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    join public.matieres m on m.school_id = c.school_id
    where c.id = _class_id and m.id = _subject_id
  );
$$;

-- "Directory" visibility of another user's profile for non-admin members.
-- Replaces the old same-school-sees-everyone rule (F-14, B3, T-16).
--   * teacher  -> students enrolled in classes they teach, those students'
--                 parents, teachers who share a class, school admins
--   * student  -> teachers of their class (affectation or timetable), admins
--   * parent   -> their children, teachers of their children's class, admins
--   * anyone   -> people who sent them a message
create or replace function public.ef_can_view_profile(_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and _target is not null and (
    -- teacher: my students
    exists (
      select 1
      from public.affectations_enseignement a
      join public.inscriptions i on i.class_section_id = a.class_section_id
      where a.teacher_id = auth.uid() and i.student_id = _target
    )
    -- teacher: parents of my students
    or exists (
      select 1
      from public.affectations_enseignement a
      join public.inscriptions i on i.class_section_id = a.class_section_id
      join public.liens_parent_eleve l on l.student_id = i.student_id
      where a.teacher_id = auth.uid() and l.parent_id = _target
    )
    -- teacher: colleagues in my classes
    or exists (
      select 1
      from public.affectations_enseignement a1
      join public.affectations_enseignement a2
        on a2.class_section_id = a1.class_section_id
      where a1.teacher_id = auth.uid() and a2.teacher_id = _target
    )
    -- teacher: colleagues scheduled in my classes
    or exists (
      select 1
      from public.affectations_enseignement a1
      join public.creneaux_edt c on c.class_section_id = a1.class_section_id
      where a1.teacher_id = auth.uid() and c.teacher_id = _target
    )
    -- student: teachers of my class (affectation)
    or exists (
      select 1
      from public.inscriptions i
      join public.affectations_enseignement a on a.class_section_id = i.class_section_id
      where i.student_id = auth.uid() and a.teacher_id = _target
    )
    -- student: teachers of my class (timetable)
    or exists (
      select 1
      from public.inscriptions i
      join public.creneaux_edt c on c.class_section_id = i.class_section_id
      where i.student_id = auth.uid() and c.teacher_id = _target
    )
    -- parent: my children
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = _target
    )
    -- parent: teachers of my children's class (affectation)
    or exists (
      select 1
      from public.liens_parent_eleve l
      join public.inscriptions i on i.student_id = l.student_id
      join public.affectations_enseignement a on a.class_section_id = i.class_section_id
      where l.parent_id = auth.uid() and a.teacher_id = _target
    )
    -- parent: teachers of my children's class (timetable)
    or exists (
      select 1
      from public.liens_parent_eleve l
      join public.inscriptions i on i.student_id = l.student_id
      join public.creneaux_edt c on c.class_section_id = i.class_section_id
      where l.parent_id = auth.uid() and c.teacher_id = _target
    )
    -- school administrators of the schools I belong to
    or exists (
      select 1
      from public.roles_utilisateurs t
      where t.user_id = _target
        and t.role = 'school_admin'
        and t.active = true
        and t.school_id in (select public.ef_user_school_ids())
    )
    -- people who sent me a message (sender-only on purpose: letting a sender
    -- read the recipient would turn "send a message" into a profile lookup)
    or exists (
      select 1 from public.messages m
      where m.recipient_id = auth.uid() and m.sender_id = _target
    )
  );
$$;

revoke all on function public.ef_try_uuid(text) from public, anon;
revoke all on function public.ef_is_school_admin_of_class(uuid) from public, anon;
revoke all on function public.ef_is_school_admin_of_user(uuid) from public, anon;
revoke all on function public.ef_user_in_school(uuid, uuid) from public, anon;
revoke all on function public.ef_user_teaches_class_subject(uuid, uuid) from public, anon;
revoke all on function public.ef_student_in_class(uuid, uuid) from public, anon;
revoke all on function public.ef_subject_in_class_school(uuid, uuid) from public, anon;
revoke all on function public.ef_can_view_profile(uuid) from public, anon;
grant execute on function public.ef_try_uuid(text) to authenticated, service_role;
grant execute on function public.ef_is_school_admin_of_class(uuid) to authenticated, service_role;
grant execute on function public.ef_is_school_admin_of_user(uuid) to authenticated, service_role;
grant execute on function public.ef_user_in_school(uuid, uuid) to authenticated, service_role;
grant execute on function public.ef_user_teaches_class_subject(uuid, uuid) to authenticated, service_role;
grant execute on function public.ef_student_in_class(uuid, uuid) to authenticated, service_role;
grant execute on function public.ef_subject_in_class_school(uuid, uuid) to authenticated, service_role;
grant execute on function public.ef_can_view_profile(uuid) to authenticated, service_role;
