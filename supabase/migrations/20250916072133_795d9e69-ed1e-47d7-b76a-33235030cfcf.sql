-- Add columns to teacher_temp_credentials table to store teacher information
ALTER TABLE public.teacher_temp_credentials 
ADD COLUMN first_name TEXT,
ADD COLUMN middle_initial TEXT,
ADD COLUMN last_name TEXT,
ADD COLUMN school_id UUID REFERENCES public.schools(id),
ADD COLUMN phone TEXT,
ADD COLUMN staff_no TEXT,
ADD COLUMN qualifications TEXT[];