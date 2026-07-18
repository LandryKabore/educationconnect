-- Break RLS cycles between inscriptions ↔ affectations_enseignement
-- (and policies that JOIN both). Direct EXISTS across those tables caused:
--   "infinite recursion detected in policy for relation inscriptions"
-- which made programme / enrollment / assignment queries return HTTP 500.

create or replace function public.ef_user_teaches_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.affectations_enseignement a
    where a.class_section_id = _class_id
      and a.teacher_id = auth.uid()
  );
$$;

create or replace function public.ef_user_enrolled_in_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inscriptions i
    where i.class_section_id = _class_id
      and i.student_id = auth.uid()
      and i.status = 'active'
  );
$$;

create or replace function public.ef_user_parent_of_student_in_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inscriptions i
    join public.liens_parent_eleve l on l.student_id = i.student_id
    where i.class_section_id = _class_id
      and i.status = 'active'
      and l.parent_id = auth.uid()
  );
$$;

create or replace function public.ef_user_teaches_student(_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inscriptions i
    join public.affectations_enseignement a
      on a.class_section_id = i.class_section_id
    where i.student_id = _student_id
      and i.status = 'active'
      and a.teacher_id = auth.uid()
  );
$$;

revoke all on function public.ef_user_teaches_class(uuid) from public;
revoke all on function public.ef_user_enrolled_in_class(uuid) from public;
revoke all on function public.ef_user_parent_of_student_in_class(uuid) from public;
revoke all on function public.ef_user_teaches_student(uuid) from public;
grant execute on function public.ef_user_teaches_class(uuid) to authenticated;
grant execute on function public.ef_user_enrolled_in_class(uuid) to authenticated;
grant execute on function public.ef_user_parent_of_student_in_class(uuid) to authenticated;
grant execute on function public.ef_user_teaches_student(uuid) to authenticated;

drop policy if exists ef_inscriptions_select on public.inscriptions;
create policy ef_inscriptions_select on public.inscriptions
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1
      from public.liens_parent_eleve l
      where l.parent_id = auth.uid()
        and l.student_id = inscriptions.student_id
    )
  );

drop policy if exists ef_aff_select on public.affectations_enseignement;
create policy ef_aff_select on public.affectations_enseignement
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_programme_select on public.programme_classe;
create policy ef_programme_select on public.programme_classe
  for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or exists (
      select 1
      from public.classes c
      where c.id = programme_classe.class_section_id
        and c.school_id in (select public.ef_user_school_ids())
    )
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_liens_select on public.liens_parent_eleve;
create policy ef_liens_select on public.liens_parent_eleve
  for select to authenticated
  using (
    parent_id = auth.uid()
    or student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_student(student_id)
  );
