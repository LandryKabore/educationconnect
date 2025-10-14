-- Add RLS policy for parents to view teacher profiles for their children's teachers
CREATE POLICY "Parents can view profiles of their children's teachers"
ON profiles
FOR SELECT
USING (
  (role = 'teacher' AND EXISTS (
    SELECT 1
    FROM parent_student_links psl
    JOIN enrollments e ON e.student_user_id = psl.student_user_id
    JOIN teaching_assignments ta ON ta.class_section_id = e.class_section_id
    WHERE ta.teacher_user_id = profiles.user_id
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
  ))
  OR is_admin()
);