-- Add temporary password column to student_temp_credentials table
ALTER TABLE public.student_temp_credentials 
ADD COLUMN temp_password_plain text;