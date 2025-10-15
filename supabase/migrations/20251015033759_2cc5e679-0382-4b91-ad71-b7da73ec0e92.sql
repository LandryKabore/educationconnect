-- Allow students to view profiles of other students in their classes
CREATE POLICY "Students can view classmates profiles"
ON public.profiles
FOR SELECT
USING (
  role = 'student' 
  AND EXISTS (
    SELECT 1 
    FROM enrollments e1
    JOIN enrollments e2 ON e2.class_section_id = e1.class_section_id
    WHERE e1.student_user_id = auth.uid()
      AND e2.student_user_id = profiles.user_id
  )
);