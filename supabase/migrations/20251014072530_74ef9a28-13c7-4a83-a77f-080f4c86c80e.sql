-- Add RLS policy for parents to view their children's grades
CREATE POLICY "Parents can view their children's grades"
ON grades
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM parent_student_links psl
    WHERE psl.student_user_id = grades.student_id
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
  )
  OR is_admin()
);