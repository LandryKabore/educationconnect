-- Add admin policy for schools table (simpler approach)
CREATE POLICY "Admins can manage schools" ON public.schools
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());