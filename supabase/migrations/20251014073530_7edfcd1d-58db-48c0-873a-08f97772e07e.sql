-- Add RLS policy for parents to view assignments for their children's classes
CREATE POLICY "Parents can view assignments for their children's classes"
ON assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM parent_student_links psl
    JOIN enrollments e ON e.student_user_id = psl.student_user_id
    WHERE e.class_section_id = assignments.class_id
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
  )
  OR is_teacher()
  OR is_admin()
);