-- Drop the problematic policy
DROP POLICY IF EXISTS "Teachers can view parent links for their students" ON public.parent_student_links;

-- Create a security definer function to check if a teacher can view a parent link
CREATE OR REPLACE FUNCTION public.teacher_can_view_parent_link(parent_link_student_id uuid, teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN teaching_assignments ta ON ta.class_section_id = e.class_section_id
    WHERE e.student_user_id = parent_link_student_id
      AND ta.teacher_user_id = teacher_id
  );
$$;

-- Create new policy using the security definer function
CREATE POLICY "Teachers can view parent links for their students"
ON public.parent_student_links
FOR SELECT
TO authenticated
USING (
  teacher_can_view_parent_link(student_user_id, auth.uid())
  OR is_admin()
);