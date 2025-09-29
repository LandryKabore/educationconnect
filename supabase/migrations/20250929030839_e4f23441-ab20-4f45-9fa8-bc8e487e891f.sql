-- Update RLS policy for parent_student_links to allow service role operations
DROP POLICY IF EXISTS "Parents can create verification requests" ON public.parent_student_links;

CREATE POLICY "Allow parent link creation for verification"
ON public.parent_student_links
FOR INSERT
WITH CHECK (true); -- Allow service role to create verification links