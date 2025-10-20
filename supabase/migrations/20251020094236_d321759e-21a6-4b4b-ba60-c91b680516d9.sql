-- Remove the foreign key constraint that requires teacher to exist in users table
-- This allows assigning unverified teachers (who only exist in teacher_temp_credentials)
ALTER TABLE public.class_section_subjects 
DROP CONSTRAINT IF EXISTS class_section_subjects_teacher_user_id_fkey;