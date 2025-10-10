-- Create security definer function to check if a teacher can view a parent profile
CREATE OR REPLACE FUNCTION public.teacher_can_view_parent_profile(parent_id uuid, teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM parent_student_links psl
    JOIN enrollments e ON e.student_user_id = psl.student_user_id
    JOIN teaching_assignments ta ON ta.class_section_id = e.class_section_id
    WHERE psl.parent_user_id = parent_id
      AND ta.teacher_user_id = teacher_id
      AND psl.status = 'active'
  );
$$;

-- Add policy to allow teachers to view parent profiles
CREATE POLICY "Teachers can view parent profiles for their students"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (role = 'parent' AND teacher_can_view_parent_profile(user_id, auth.uid()))
  OR is_admin()
);