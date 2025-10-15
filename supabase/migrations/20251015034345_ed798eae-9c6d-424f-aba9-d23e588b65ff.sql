-- Drop the policy that's not working
DROP POLICY IF EXISTS "Students can view classmates profiles" ON public.profiles;

-- Create a better policy for students to see their classmates
CREATE POLICY "Students can view their classmates"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (role = 'student') 
  AND (
    -- User can see themselves
    user_id = auth.uid()
    OR
    -- Or they share a class
    EXISTS (
      SELECT 1 
      FROM enrollments e1
      INNER JOIN enrollments e2 ON e2.class_section_id = e1.class_section_id
      WHERE e1.student_user_id = auth.uid()
        AND e2.student_user_id = profiles.user_id
        AND e1.student_user_id != e2.student_user_id
    )
  )
);