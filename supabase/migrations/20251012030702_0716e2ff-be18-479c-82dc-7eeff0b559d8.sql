-- Add admin DELETE policies for tables that are missing them

-- Allow admins to delete grades (for assignments)
CREATE POLICY "Admins can delete grades"
ON public.grades
FOR DELETE
TO authenticated
USING (is_admin());

-- Allow admins to delete enhanced_grades (for exams)
CREATE POLICY "Admins can delete enhanced grades"
ON public.enhanced_grades
FOR DELETE
TO authenticated
USING (is_admin());

-- Allow admins to delete enhanced_attendance
CREATE POLICY "Admins can delete attendance"
ON public.enhanced_attendance
FOR DELETE
TO authenticated
USING (is_admin());