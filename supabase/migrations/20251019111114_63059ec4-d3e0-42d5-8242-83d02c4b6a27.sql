-- Delete all subjects
DELETE FROM subjects;

-- Add unique constraint to prevent duplicate subjects per school
ALTER TABLE subjects ADD CONSTRAINT unique_subject_per_school UNIQUE (name, school_id);