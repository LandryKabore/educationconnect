-- Allow teachers to view student profiles in their classes
CREATE POLICY "Teachers can view student profiles in their classes"
ON public.profiles
FOR SELECT
USING (
  role = 'student' AND (
    EXISTS (
      SELECT 1 
      FROM enrollments e
      JOIN teaching_assignments ta ON ta.class_section_id = e.class_section_id
      WHERE e.student_user_id = profiles.user_id 
        AND ta.teacher_user_id = auth.uid()
    )
    OR is_admin()
  )
);