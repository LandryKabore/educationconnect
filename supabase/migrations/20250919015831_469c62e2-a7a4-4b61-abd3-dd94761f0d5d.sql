-- Allow students to view teacher profiles for their classes
CREATE POLICY "Students can view teacher profiles for their classes" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'teacher' AND (
    EXISTS (
      SELECT 1 
      FROM teaching_assignments ta
      JOIN enrollments e ON e.class_section_id = ta.class_section_id
      WHERE ta.teacher_user_id = profiles.user_id 
        AND e.student_user_id = auth.uid()
    )
    OR is_admin()
  )
);