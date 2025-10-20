-- Add subjects_taught column to teacher_temp_credentials table
ALTER TABLE public.teacher_temp_credentials 
ADD COLUMN subjects_taught TEXT;