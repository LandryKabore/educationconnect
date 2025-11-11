-- Drop the old unique constraint that doesn't include subject_id
ALTER TABLE public.enhanced_attendance 
DROP CONSTRAINT IF EXISTS enhanced_attendance_student_user_id_class_section_id_date_key;

-- Add new unique constraint including subject_id
-- This allows a student to have multiple attendance records on the same date in the same class
-- if they're for different subjects (e.g., Math in morning, Physics in afternoon)
ALTER TABLE public.enhanced_attendance 
ADD CONSTRAINT enhanced_attendance_student_class_subject_date_key 
UNIQUE (student_user_id, class_section_id, subject_id, date);