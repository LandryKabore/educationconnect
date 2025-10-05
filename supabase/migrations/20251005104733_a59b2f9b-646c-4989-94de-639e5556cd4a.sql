-- Add UPDATE policy for parent_student_links to allow verification flow
-- This allows updating a pending link to active when a parent signs up with a verification code
CREATE POLICY "Allow updating pending links for verification"
ON parent_student_links
FOR UPDATE
USING (
  status = 'pending' 
  AND verification_code IS NOT NULL
  AND parent_user_id IS NULL
)
WITH CHECK (
  status = 'active'
  AND parent_user_id = auth.uid()
);

-- Add comment explaining the policy
COMMENT ON POLICY "Allow updating pending links for verification" ON parent_student_links IS 
'Allows anyone to update a pending parent-student link to active by setting their user_id as parent_user_id during the verification signup flow';