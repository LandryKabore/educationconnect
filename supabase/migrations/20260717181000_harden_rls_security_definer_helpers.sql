-- Prefer SECURITY DEFINER helpers over cross-table EXISTS in RLS
-- so future policy edits cannot recreate inscriptions ↔ affectations recursion.

drop policy if exists ef_devoirs_select on public.devoirs;
create policy ef_devoirs_select on public.devoirs
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_notes_select on public.notes;
create policy ef_notes_select on public.notes
  for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = notes.student_id
    )
  );

drop policy if exists ef_notes_write on public.notes;
create policy ef_notes_write on public.notes
  for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
  );

drop policy if exists ef_presences_select on public.presences;
create policy ef_presences_select on public.presences
  for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = presences.student_id
    )
  );

drop policy if exists ef_presences_write on public.presences;
create policy ef_presences_write on public.presences
  for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
  );
