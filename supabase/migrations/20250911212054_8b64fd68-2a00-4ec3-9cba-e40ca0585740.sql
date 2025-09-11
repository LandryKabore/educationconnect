-- Remove hardcoded subjects data
DELETE FROM subjects WHERE school_id IS NULL;

-- Enable RLS policies for subjects table to allow CRUD operations
CREATE POLICY "Admins can manage subjects" 
ON subjects 
FOR ALL 
USING (is_admin());

CREATE POLICY "Teachers can create subjects for their school" 
ON subjects 
FOR INSERT 
WITH CHECK (is_teacher() OR is_admin());