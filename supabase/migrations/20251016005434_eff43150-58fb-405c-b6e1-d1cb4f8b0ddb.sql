-- Fix study_groups DELETE policy to check membership BEFORE deletion
-- Also add CASCADE to study_group_members foreign key

-- First, drop the existing policy
DROP POLICY IF EXISTS "Teachers can manage study groups for their classes" ON public.study_groups;

-- Create a security definer function to check if user is group creator
CREATE OR REPLACE FUNCTION public.is_study_group_creator(group_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM study_group_members
    WHERE study_group_id = group_id
      AND user_id = is_study_group_creator.user_id
      AND role = 'admin'
  );
$$;

-- Recreate the policy using the function
CREATE POLICY "Teachers can manage study groups for their classes"
ON public.study_groups
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM teaching_assignments ta
    WHERE ta.class_section_id = study_groups.class_section_id
      AND ta.subject_id = study_groups.subject_id
      AND ta.teacher_user_id = auth.uid()
  ) OR is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM teaching_assignments ta
    WHERE ta.class_section_id = study_groups.class_section_id
      AND ta.subject_id = study_groups.subject_id
      AND ta.teacher_user_id = auth.uid()
  ) OR is_admin()
);

-- Allow students to delete groups they created
CREATE POLICY "Students can delete study groups they created"
ON public.study_groups
FOR DELETE
TO authenticated
USING (
  is_study_group_creator(id, auth.uid()) OR is_admin()
);