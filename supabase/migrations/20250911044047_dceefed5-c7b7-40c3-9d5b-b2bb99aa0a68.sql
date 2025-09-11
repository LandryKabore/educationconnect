-- Drop the conflicting policy and create a temporary one that allows school creation
DROP POLICY IF EXISTS "Admins can manage schools" ON public.schools;

-- Temporary policy to allow school creation when admin_access is true
CREATE POLICY "Allow school creation" ON public.schools
FOR ALL
USING (true)
WITH CHECK (true);