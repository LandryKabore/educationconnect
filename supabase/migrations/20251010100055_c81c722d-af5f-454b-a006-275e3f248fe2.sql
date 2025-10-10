-- Allow teachers to view parent-student links for students in their classes
CREATE POLICY "Teachers can view parent links for their students"
ON public.parent_student_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN teaching_assignments ta ON ta.class_section_id = e.class_section_id
    WHERE e.student_user_id = parent_student_links.student_user_id
      AND ta.teacher_user_id = auth.uid()
  )
  OR is_admin()
);