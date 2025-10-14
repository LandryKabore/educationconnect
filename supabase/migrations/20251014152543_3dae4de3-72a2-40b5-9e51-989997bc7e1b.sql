-- Drop the old check constraint
ALTER TABLE enhanced_attendance DROP CONSTRAINT IF EXISTS enhanced_attendance_status_check;

-- Add new check constraint that includes 'excused'
ALTER TABLE enhanced_attendance ADD CONSTRAINT enhanced_attendance_status_check 
CHECK (status IN ('present', 'absent', 'late', 'excused'));