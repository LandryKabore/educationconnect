-- Fix the assignments table to properly reference class_sections instead of classes
-- First, drop the existing foreign key constraint if it exists
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_class_id_fkey;

-- Add the correct foreign key constraint to reference class_sections
ALTER TABLE assignments ADD CONSTRAINT assignments_class_id_fkey 
  FOREIGN KEY (class_id) REFERENCES class_sections(id) ON DELETE CASCADE;