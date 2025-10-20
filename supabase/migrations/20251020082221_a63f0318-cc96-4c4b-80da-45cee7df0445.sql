-- Add subjects_taught field to teacher_profiles table
-- This allows teachers to specify what subjects they teach (comma-separated)
ALTER TABLE public.teacher_profiles 
ADD COLUMN IF NOT EXISTS subjects_taught text;