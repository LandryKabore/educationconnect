-- One exam per class per calendar day (any teacher).
-- Prevents two professors from scheduling exams on the same day in the same class.

create unique index if not exists devoirs_one_examen_per_class_day
  on public.devoirs (class_section_id, due_date)
  where kind = 'examen' and due_date is not null;

-- Teachers who teach a class can see that class's exams (not homework),
-- so they can avoid picking a day already taken by a colleague.
drop policy if exists ef_devoirs_select on public.devoirs;
create policy ef_devoirs_select on public.devoirs
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
    or (
      kind = 'examen'
      and public.ef_user_teaches_class(class_section_id)
    )
  );
