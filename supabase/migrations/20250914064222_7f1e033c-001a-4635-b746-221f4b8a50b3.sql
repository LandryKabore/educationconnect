-- Add schedule fields to subjects table
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS schedule_days text[], -- Array of days like ['monday', 'wednesday', 'friday']
ADD COLUMN IF NOT EXISTS schedule_time_start time, -- Start time like '09:00'
ADD COLUMN IF NOT EXISTS schedule_time_end time, -- End time like '10:30'
ADD COLUMN IF NOT EXISTS schedule_duration integer; -- Duration in minutes