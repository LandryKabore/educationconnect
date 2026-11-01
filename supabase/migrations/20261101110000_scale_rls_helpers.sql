-- Scale pack 2/4: set-returning RLS helpers ("which classes / users / children are mine").
--
-- Why: the current policies call row-argument helpers such as
-- ef_is_school_admin_of_class(class_section_id) once PER ROW (370k attendance rows ->
-- hundreds of thousands of function calls).  These helpers return the whole set for the
-- signed-in user once, and the policies (next migration) use "col IN (SELECT helper())",
-- which Postgres evaluates once per statement.
--
-- Security notes:
--  * Same pattern as the existing ef_* helpers: SECURITY DEFINER (so they can read
--    roles/classes/inscriptions without recursing into RLS), STABLE, fixed search_path,
--    and they only ever look at auth.uid() -- they take NO user-supplied argument, so a
--    caller can only ever list what they already own.
--  * EXECUTE is revoked from public/anon; only authenticated + service_role may call them.
--  * Each helper reproduces the exact predicate of the old row helper it replaces (named in
--    its comment).  qa/scale-pack/tools/rls-equivalence.sql proves old == new per principal.
-- Rollback: rollback/20261101110000_scale_rls_helpers.down.sql (run AFTER rolling back the policies).

-- replaces ef_is_school_admin(school_id)
create or replace function public.ef_my_admin_school_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 5
as $$
  select r.school_id
  from public.roles_utilisateurs r
  where r.user_id = auth.uid()
    and r.role = 'school_admin'
    and r.active = true
    and r.school_id is not null;
$$;

-- replaces ef_is_school_admin_of_class(class_id)
create or replace function public.ef_my_admin_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 100
as $$
  select c.id
  from public.classes c
  where c.school_id in (
    select r.school_id from public.roles_utilisateurs r
    where r.user_id = auth.uid()
      and r.role = 'school_admin'
      and r.active = true
      and r.school_id is not null
  );
$$;

-- every class of the schools I belong to (any active role)
-- replaces: exists (select 1 from classes c where c.id = X and c.school_id in (select ef_user_school_ids()))
create or replace function public.ef_my_school_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 100
as $$
  select c.id
  from public.classes c
  where c.school_id in (select public.ef_user_school_ids());
$$;

-- replaces ef_user_teaches_class(class_id)
create or replace function public.ef_my_taught_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 20
as $$
  select distinct a.class_section_id
  from public.affectations_enseignement a
  where a.teacher_id = auth.uid();
$$;

-- replaces ef_user_teaches_class_subject(class_id, subject_id)
create or replace function public.ef_my_teaching_pairs()
returns table (class_section_id uuid, subject_id uuid)
language sql stable security definer set search_path = public
rows 30
as $$
  select a.class_section_id, a.subject_id
  from public.affectations_enseignement a
  where a.teacher_id = auth.uid();
$$;

-- replaces ef_user_enrolled_in_class(class_id)
create or replace function public.ef_my_enrolled_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 2
as $$
  select i.class_section_id
  from public.inscriptions i
  where i.student_id = auth.uid()
    and i.status = 'active';
$$;

-- replaces ef_user_parent_of_student_in_class(class_id)
create or replace function public.ef_my_parent_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 3
as $$
  select i.class_section_id
  from public.inscriptions i
  join public.liens_parent_eleve l on l.student_id = i.student_id
  where l.parent_id = auth.uid()
    and i.status = 'active';
$$;

-- replaces: exists (select 1 from liens_parent_eleve l where l.parent_id = auth.uid() and l.student_id = X)
create or replace function public.ef_my_child_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 3
as $$
  select l.student_id
  from public.liens_parent_eleve l
  where l.parent_id = auth.uid();
$$;

-- replaces ef_is_school_admin_of_user(user_id): everybody (except super admins) who has a
-- role in a school I administer.
create or replace function public.ef_my_admin_user_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 3000
as $$
  select tgt.user_id
  from public.roles_utilisateurs tgt
  where tgt.role <> 'super_admin'
    and tgt.school_id in (
      select r.school_id from public.roles_utilisateurs r
      where r.user_id = auth.uid()
        and r.role = 'school_admin'
        and r.active = true
        and r.school_id is not null
    );
$$;

-- replaces ef_user_teaches_student(student_id)
create or replace function public.ef_my_taught_student_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 400
as $$
  select i.student_id
  from public.inscriptions i
  join public.affectations_enseignement a on a.class_section_id = i.class_section_id
  where a.teacher_id = auth.uid()
    and i.status = 'active';
$$;

-- replaces ef_can_view_profile(target): the set of profiles I may read through relationships
-- (teacher<->students/parents/colleagues, student->teachers, parent->children/teachers,
-- school admins of my schools, people who messaged me).  One UNION arm per branch of the
-- old function, same joins, same filters.
create or replace function public.ef_my_visible_profile_ids()
returns setof uuid
language sql stable security definer set search_path = public
rows 1500
as $$
  -- teacher: my students
  select i.student_id
  from public.affectations_enseignement a
  join public.inscriptions i on i.class_section_id = a.class_section_id
  where a.teacher_id = auth.uid()
  union
  -- teacher: parents of my students
  select l.parent_id
  from public.affectations_enseignement a
  join public.inscriptions i on i.class_section_id = a.class_section_id
  join public.liens_parent_eleve l on l.student_id = i.student_id
  where a.teacher_id = auth.uid()
  union
  -- teacher: colleagues in my classes
  select a2.teacher_id
  from public.affectations_enseignement a1
  join public.affectations_enseignement a2 on a2.class_section_id = a1.class_section_id
  where a1.teacher_id = auth.uid()
  union
  -- teacher: colleagues scheduled in my classes
  select c.teacher_id
  from public.affectations_enseignement a1
  join public.creneaux_edt c on c.class_section_id = a1.class_section_id
  where a1.teacher_id = auth.uid()
  union
  -- student: teachers of my class (assignment)
  select a.teacher_id
  from public.inscriptions i
  join public.affectations_enseignement a on a.class_section_id = i.class_section_id
  where i.student_id = auth.uid()
  union
  -- student: teachers of my class (timetable)
  select c.teacher_id
  from public.inscriptions i
  join public.creneaux_edt c on c.class_section_id = i.class_section_id
  where i.student_id = auth.uid()
  union
  -- parent: my children
  select l.student_id
  from public.liens_parent_eleve l
  where l.parent_id = auth.uid()
  union
  -- parent: teachers of my children's class (assignment)
  select a.teacher_id
  from public.liens_parent_eleve l
  join public.inscriptions i on i.student_id = l.student_id
  join public.affectations_enseignement a on a.class_section_id = i.class_section_id
  where l.parent_id = auth.uid()
  union
  -- parent: teachers of my children's class (timetable)
  select c.teacher_id
  from public.liens_parent_eleve l
  join public.inscriptions i on i.student_id = l.student_id
  join public.creneaux_edt c on c.class_section_id = i.class_section_id
  where l.parent_id = auth.uid()
  union
  -- school administrators of the schools I belong to
  select t.user_id
  from public.roles_utilisateurs t
  where t.role = 'school_admin'
    and t.active = true
    and t.school_id in (select public.ef_user_school_ids())
  union
  -- people who sent me a message (sender-only on purpose, see ef_can_view_profile)
  select m.sender_id
  from public.messages m
  where m.recipient_id = auth.uid();
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'ef_my_admin_school_ids()', 'ef_my_admin_class_ids()', 'ef_my_school_class_ids()',
    'ef_my_taught_class_ids()', 'ef_my_teaching_pairs()', 'ef_my_enrolled_class_ids()',
    'ef_my_parent_class_ids()', 'ef_my_child_ids()', 'ef_my_admin_user_ids()',
    'ef_my_taught_student_ids()', 'ef_my_visible_profile_ids()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
