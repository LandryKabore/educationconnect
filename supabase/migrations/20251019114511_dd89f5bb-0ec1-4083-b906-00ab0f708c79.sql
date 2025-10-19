-- Add essential fields to teacher_temp_credentials table
ALTER TABLE teacher_temp_credentials
ADD COLUMN IF NOT EXISTS prefix text,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS dob date;

-- Add essential fields to teacher_profiles table
ALTER TABLE teacher_profiles
ADD COLUMN IF NOT EXISTS prefix text,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS dob date;