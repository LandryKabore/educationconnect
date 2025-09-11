-- Fix infinite recursion by dropping the problematic policies only
DROP POLICY IF EXISTS "Students can view teaching assignments for their classes" ON public.teaching_assignments;
DROP POLICY IF EXISTS "Teachers can view their own assignments" ON public.teaching_assignments;

-- Create simpler policy for reading
CREATE POLICY "Allow teaching assignments read" ON public.teaching_assignments
FOR SELECT 
USING (true);