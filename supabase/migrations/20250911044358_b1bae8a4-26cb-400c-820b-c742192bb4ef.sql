-- Fix infinite recursion in teaching_assignments policies
-- First, drop existing problematic policies
DROP POLICY IF EXISTS "Students can view teaching assignments for their classes" ON public.teaching_assignments;
DROP POLICY IF EXISTS "Teachers can view their own assignments" ON public.teaching_assignments;

-- Create simpler policies without recursion
CREATE POLICY "Allow teaching assignments read" ON public.teaching_assignments
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage teaching assignments" ON public.teaching_assignments
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());