-- Allow students to view enrollments of other students in the same class
CREATE POLICY "Students can view classmates enrollments"
ON public.enrollments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM enrollments my_enrollment
    WHERE my_enrollment.student_user_id = auth.uid()
      AND my_enrollment.class_section_id = enrollments.class_section_id
  )
  OR is_admin()
  OR is_teacher()
);