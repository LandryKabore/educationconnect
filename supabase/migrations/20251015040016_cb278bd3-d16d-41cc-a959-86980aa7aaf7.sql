-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Students can view classmates enrollments" ON public.enrollments;

-- Create security definer function to check if users share a class
CREATE OR REPLACE FUNCTION public.shares_class_with(target_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM enrollments e1
    JOIN enrollments e2 ON e1.class_section_id = e2.class_section_id
    WHERE e1.student_user_id = auth.uid()
      AND e2.student_user_id = target_student_id
      AND e1.student_user_id != e2.student_user_id
  );
$$;

-- Recreate the enrollments policy using the security definer function
CREATE POLICY "Students can view classmates enrollments"
ON public.enrollments
FOR SELECT
TO authenticated
USING (
  student_user_id = auth.uid()
  OR shares_class_with(student_user_id)
  OR is_admin()
  OR is_teacher()
);

-- Also fix the profiles policy to use the function
DROP POLICY IF EXISTS "Students can view their classmates" ON public.profiles;

CREATE POLICY "Students can view their classmates"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'::user_role 
  AND (
    user_id = auth.uid()
    OR shares_class_with(user_id)
    OR is_admin()
  )
);