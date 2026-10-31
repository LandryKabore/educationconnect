-- Security hardening 3/6: bind every school-admin policy to the row's school.
--
-- F-01 / F-04 / F-06 / F-07 / T-14 / student-parent B1+B2:
--   ef_is_school_admin() with no argument matched an admin of ANY school, and
--   creneaux_edt SELECT was USING (true).  Every policy below is rewritten so
--   the school admin must administer the school that owns the row (resolved
--   through the class, or through the target user's roles), and so that
--   students / parents / teachers only see rows of their own classes.
--
-- Also fixes: classes / matieres / annees_scolaires "FOR ALL" policies whose
-- USING clause included "any member of the school", which let students and
-- teachers DELETE classes, subjects and academic years of their school.

-- ----------------------------------------- classes / matieres / annees ------
drop policy if exists ef_classes_all on public.classes;
drop policy if exists ef_classes_select on public.classes;
drop policy if exists ef_classes_write on public.classes;
create policy ef_classes_select on public.classes for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or school_id in (select public.ef_user_school_ids())
  );
create policy ef_classes_write on public.classes for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

drop policy if exists ef_matieres_all on public.matieres;
drop policy if exists ef_matieres_select on public.matieres;
drop policy if exists ef_matieres_write on public.matieres;
create policy ef_matieres_select on public.matieres for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or school_id in (select public.ef_user_school_ids())
  );
create policy ef_matieres_write on public.matieres for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

drop policy if exists ef_annees_all on public.annees_scolaires;
drop policy if exists ef_annees_select on public.annees_scolaires;
drop policy if exists ef_annees_write on public.annees_scolaires;
create policy ef_annees_select on public.annees_scolaires for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or school_id in (select public.ef_user_school_ids())
  );
create policy ef_annees_write on public.annees_scolaires for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

-- ------------------------------------------------------------ inscriptions -
drop policy if exists ef_inscriptions_select on public.inscriptions;
drop policy if exists ef_inscriptions_admin on public.inscriptions;
create policy ef_inscriptions_select on public.inscriptions for select to authenticated
  using (
    student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = inscriptions.student_id
    )
  );
create policy ef_inscriptions_admin on public.inscriptions for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_class(class_section_id)
      and public.ef_is_school_admin_of_user(student_id)
    )
  );

-- ------------------------------------------------- affectations_enseignement
drop policy if exists ef_aff_select on public.affectations_enseignement;
drop policy if exists ef_aff_admin on public.affectations_enseignement;
create policy ef_aff_select on public.affectations_enseignement for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );
create policy ef_aff_admin on public.affectations_enseignement for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_class(class_section_id)
      and public.ef_is_school_admin_of_user(teacher_id)
      and public.ef_subject_in_class_school(class_section_id, subject_id)
    )
  );

-- --------------------------------------------------------- liens_parent_eleve
drop policy if exists ef_liens_select on public.liens_parent_eleve;
drop policy if exists ef_liens_admin on public.liens_parent_eleve;
create policy ef_liens_select on public.liens_parent_eleve for select to authenticated
  using (
    parent_id = auth.uid()
    or student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_user(student_id)
    or public.ef_user_teaches_student(student_id)
  );
create policy ef_liens_admin on public.liens_parent_eleve for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_user(student_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_user(student_id)
      and public.ef_is_school_admin_of_user(parent_id)
    )
  );

-- ----------------------------------------------------------- programme_classe
drop policy if exists ef_programme_select on public.programme_classe;
create policy ef_programme_select on public.programme_classe for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or exists (
      select 1 from public.classes c
      where c.id = programme_classe.class_section_id
        and c.school_id in (select public.ef_user_school_ids())
    )
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

-- ---------------------------------------------------------- composition_sessions
drop policy if exists ef_composition_sessions_select on public.composition_sessions;
drop policy if exists ef_composition_sessions_write on public.composition_sessions;
create policy ef_composition_sessions_select on public.composition_sessions
  for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );
create policy ef_composition_sessions_write on public.composition_sessions
  for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id));

-- --------------------------------------------------------------- creneaux_edt
drop policy if exists ef_edt_select on public.creneaux_edt;
drop policy if exists ef_edt_admin on public.creneaux_edt;
create policy ef_edt_select on public.creneaux_edt for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );
create policy ef_edt_admin on public.creneaux_edt for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_class(class_section_id)
      and public.ef_is_school_admin_of_user(teacher_id)
      and public.ef_subject_in_class_school(class_section_id, subject_id)
    )
  );
