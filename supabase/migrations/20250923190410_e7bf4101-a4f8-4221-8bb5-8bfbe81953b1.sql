-- Fix RLS policies for assignments table to allow teachers to create assignments
DROP POLICY IF EXISTS "Authenticated can read assignments" ON assignments;

-- Allow teachers to manage their own assignments
CREATE POLICY "Teachers can manage their assignments" ON assignments 
FOR ALL 
USING (teacher_id = auth.uid() OR is_admin())
WITH CHECK (teacher_id = auth.uid() OR is_admin());

-- Allow students to view assignments for their classes
CREATE POLICY "Students can view class assignments" ON assignments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM enrollments e 
    WHERE e.class_section_id = assignments.class_id 
    AND e.student_user_id = auth.uid()
  ) 
  OR is_teacher() 
  OR is_admin()
);

-- Create student_grades view for GPA calculation
CREATE OR REPLACE VIEW student_grades AS
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
  g.graded_at
FROM grades g
JOIN assignments a ON a.id = g.assignment_id
LEFT JOIN subjects s ON s.id = a.subject_id;

-- Grant permissions on the view
GRANT SELECT ON student_grades TO authenticated;

-- Create RLS policy for the view
ALTER VIEW student_grades OWNER TO postgres;

-- Function to calculate student GPA
CREATE OR REPLACE FUNCTION calculate_student_gpa(student_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(AVG(grade_points), 0.0)::numeric(3,2)
  FROM student_grades
  WHERE student_id = student_user_id;
$$;