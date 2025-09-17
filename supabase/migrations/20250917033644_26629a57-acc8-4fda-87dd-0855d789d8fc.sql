-- Add columns to store intended teaching assignments in temp credentials
ALTER TABLE public.teacher_temp_credentials 
ADD COLUMN intended_class_section_ids UUID[],
ADD COLUMN intended_subject_ids UUID[];