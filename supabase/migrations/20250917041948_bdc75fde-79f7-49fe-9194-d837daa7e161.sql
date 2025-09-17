-- Create a function that allows teachers to get student names for their classes
CREATE OR REPLACE FUNCTION public.get_student_names_for_teacher(student_ids uuid[], teacher_id uuid)
RETURNS TABLE(user_id uuid, first_name text, last_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user is a teacher
  IF NOT is_teacher() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only teachers and admins can access student names';
  END IF;
  
  -- Return student names only for students in classes the teacher teaches
  RETURN QUERY
  SELECT p.user_id, p.first_name, p.last_name
  FROM profiles p
  WHERE p.user_id = ANY(student_ids)
    AND (
      -- Teacher can see students in their classes
      EXISTS (
        SELECT 1 
        FROM enrollments e
        JOIN teaching_assignments ta ON ta.class_section_id = e.class_section_id
        WHERE e.student_user_id = p.user_id 
          AND ta.teacher_user_id = teacher_id
      )
      OR is_admin()
    );
END;
$$;