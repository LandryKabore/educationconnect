-- Add temp_password_plain column to teacher_temp_credentials table
-- This allows admins to view and share temporary passwords with teachers
ALTER TABLE public.teacher_temp_credentials 
ADD COLUMN IF NOT EXISTS temp_password_plain text;

-- Update the create-teacher-with-temp-creds function to also store plain password
-- (The edge function will need to be updated separately)