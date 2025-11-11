-- Add subject_id to enhanced_attendance table to track attendance by subject
-- This allows multiple teachers to take attendance for the same class on different subjects

ALTER TABLE public.enhanced_attendance 
ADD COLUMN subject_id UUID REFERENCES public.subjects(id);

-- Create an index for better query performance
CREATE INDEX idx_enhanced_attendance_subject_id ON public.enhanced_attendance(subject_id);

-- Update RLS policies to include subject_id filtering
DROP POLICY IF EXISTS "Teachers can manage attendance for their classes" ON public.enhanced_attendance;

CREATE POLICY "Teachers can manage attendance for their classes" 
ON public.enhanced_attendance 
FOR ALL 
USING (
  EXISTS (
    SELECT 1
    FROM teaching_assignments ta
    WHERE ta.class_section_id = enhanced_attendance.class_section_id
      AND ta.subject_id = enhanced_attendance.subject_id
      AND ta.teacher_user_id = auth.uid()
  ) OR is_admin()
);

-- Update the policy for parents to include subject filtering
DROP POLICY IF EXISTS "Parents can view their children's attendance" ON public.enhanced_attendance;

CREATE POLICY "Parents can view their children's attendance" 
ON public.enhanced_attendance 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM parent_student_links psl
    WHERE psl.student_user_id = enhanced_attendance.student_user_id
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
  ) OR is_admin() OR is_teacher() OR student_user_id = auth.uid()
);