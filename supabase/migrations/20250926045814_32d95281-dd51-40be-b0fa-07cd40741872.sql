-- Add coefficient column to subjects table
ALTER TABLE public.subjects ADD COLUMN coefficient NUMERIC(3,2) DEFAULT 1.0;

-- Update existing subjects to have default coefficient
UPDATE public.subjects SET coefficient = 1.0 WHERE coefficient IS NULL;

-- Update the GPA calculation function to use weighted coefficients
CREATE OR REPLACE FUNCTION public.calculate_student_gpa(student_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE 
      WHEN SUM(s.coefficient) = 0 THEN 0.0
      ELSE SUM(
        CASE 
          WHEN (g.points_earned / a.max_points * 100) >= 90 THEN 4.0 * s.coefficient
          WHEN (g.points_earned / a.max_points * 100) >= 80 THEN 3.0 * s.coefficient
          WHEN (g.points_earned / a.max_points * 100) >= 70 THEN 2.0 * s.coefficient
          WHEN (g.points_earned / a.max_points * 100) >= 60 THEN 1.0 * s.coefficient
          ELSE 0.0 * s.coefficient
        END
      ) / SUM(s.coefficient)
    END
  , 0.0)::numeric(3,2)
  FROM grades g
  JOIN assignments a ON a.id = g.assignment_id
  LEFT JOIN subjects s ON s.id = a.subject_id
  WHERE g.student_id = student_user_id;
$function$