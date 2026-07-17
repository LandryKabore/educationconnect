-- Messaging contacts: school members can see roles in their schools;
-- teachers can see parent links for students they teach.

drop policy if exists ef_roles_select on public.roles_utilisateurs;
create policy ef_roles_select on public.roles_utilisateurs for select to authenticated
  using (
    user_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or (
      school_id is not null
      and school_id in (select public.ef_user_school_ids())
    )
  );

drop policy if exists ef_liens_select on public.liens_parent_eleve;
create policy ef_liens_select on public.liens_parent_eleve for select to authenticated
  using (
    parent_id = auth.uid()
    or student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or exists (
      select 1
      from public.inscriptions i
      join public.affectations_enseignement a
        on a.class_section_id = i.class_section_id
      where i.student_id = liens_parent_eleve.student_id
        and i.status = 'active'
        and a.teacher_id = auth.uid()
    )
  );

-- Parents/students can see teachers of their (children's) classes for messaging
drop policy if exists ef_aff_select on public.affectations_enseignement;
create policy ef_aff_select on public.affectations_enseignement for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or exists (
      select 1 from public.inscriptions i
      where i.class_section_id = affectations_enseignement.class_section_id
        and i.student_id = auth.uid()
        and i.status = 'active'
    )
    or exists (
      select 1
      from public.inscriptions i
      join public.liens_parent_eleve l on l.student_id = i.student_id
      where i.class_section_id = affectations_enseignement.class_section_id
        and i.status = 'active'
        and l.parent_id = auth.uid()
    )
  );
