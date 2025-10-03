-- Drop the old SELECT policy that's too restrictive
DROP POLICY IF EXISTS "Parents and students can view their links" ON parent_student_links;

-- Create new SELECT policy that allows viewing pending links by verification code
CREATE POLICY "Parents and students can view their links"
ON parent_student_links
FOR SELECT
USING (
  (parent_user_id = auth.uid()) 
  OR (student_user_id = auth.uid()) 
  OR is_admin()
  OR (status = 'pending' AND verification_code IS NOT NULL)
);

-- Add comment explaining the policy
COMMENT ON POLICY "Parents and students can view their links" ON parent_student_links IS 
'Allows parents and students to view their own links, admins to view all links, and anyone to view pending links with verification codes for the verification flow';