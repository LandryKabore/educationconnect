-- Move schedule fields from subjects table to class_section_subjects table

-- Add schedule columns to class_section_subjects
ALTER TABLE class_section_subjects
ADD COLUMN schedule_days text[],
ADD COLUMN schedule_time_start time,
ADD COLUMN schedule_time_end time,
ADD COLUMN schedule_duration integer;

-- Remove schedule columns from subjects table
ALTER TABLE subjects
DROP COLUMN schedule_days,
DROP COLUMN schedule_time_start,
DROP COLUMN schedule_time_end,
DROP COLUMN schedule_duration;