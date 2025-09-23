-- Create a function to get student grades (no RLS needed on views)
CREATE OR REPLACE FUNCTION get_student_grades(student_user_id uuid)
RETURNS TABLE (
  student_id uuid,
  assignment_id uuid,
  points_earned numeric,
  max_points numeric,
  class_id uuid,
  subject_id uuid,
  subject_name text,
  percentage numeric,
  grade_points numeric,
  graded_at timestamptz,
  assignment_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    g.student_id,
    g.assignment_id,
    g.points_earned,
    a.max_points,
    a.class_id,
    a.subject_id,
    s.name as subject_name,
    (g.points_earned / a.max_points * 100) as percentage,
    CASE 
      WHEN (g.points_earned / a.max_points * 100) >= 90 THEN 4.0
      WHEN (g.points_earned / a.max_points * 100) >= 80 THEN 3.0
      WHEN (g.points_earned / a.max_points * 100) >= 70 THEN 2.0
      WHEN (g.points_earned / a.max_points * 100) >= 60 THEN 1.0
      ELSE 0.0
    END as grade_points,
    g.graded_at,
    a.title as assignment_title
  FROM grades g
  JOIN assignments a ON a.id = g.assignment_id
  LEFT JOIN subjects s ON s.id = a.subject_id
  WHERE g.student_id = student_user_id
    OR student_user_id = auth.uid()
    OR is_teacher() 
    OR is_admin();
$$;

-- Update GPA calculation function
CREATE OR REPLACE FUNCTION calculate_student_gpa(student_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(AVG(
    CASE 
      WHEN (g.points_earned / a.max_points * 100) >= 90 THEN 4.0
      WHEN (g.points_earned / a.max_points * 100) >= 80 THEN 3.0
      WHEN (g.points_earned / a.max_points * 100) >= 70 THEN 2.0
      WHEN (g.points_earned / a.max_points * 100) >= 60 THEN 1.0
      ELSE 0.0
    END
  ), 0.0)::numeric(3,2)
  FROM grades g
  JOIN assignments a ON a.id = g.assignment_id
  WHERE g.student_id = student_user_id;
$$;