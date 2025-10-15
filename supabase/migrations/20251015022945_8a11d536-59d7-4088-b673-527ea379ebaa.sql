-- Drop and recreate the RLS policy for inserting study group members
-- to allow students to add classmates when creating a group

DROP POLICY IF EXISTS "Students can join groups" ON public.study_group_members;

-- Students can add members to groups in their class
CREATE POLICY "Students can add members to groups"
  ON public.study_group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_groups sg
      JOIN public.enrollments e1 ON e1.class_section_id = sg.class_section_id
      JOIN public.enrollments e2 ON e2.class_section_id = sg.class_section_id
      WHERE sg.id = study_group_members.study_group_id
        AND e1.student_user_id = auth.uid()
        AND e2.student_user_id = study_group_members.user_id
    )
  );

-- Also fix the INSERT policy on study_groups to be clearer
DROP POLICY IF EXISTS "Students can create study groups" ON public.study_groups;

CREATE POLICY "Students can create study groups in their class"
  ON public.study_groups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.student_user_id = auth.uid()
        AND enrollments.class_section_id = study_groups.class_section_id
    )
  );