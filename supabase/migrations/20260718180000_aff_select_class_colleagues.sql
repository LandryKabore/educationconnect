-- Teachers who teach in a class can see all teaching assignments for that class
-- (so they can see which colleague teaches each matière on the class overview).

drop policy if exists ef_aff_select on public.affectations_enseignement;
create policy ef_aff_select on public.affectations_enseignement
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );
