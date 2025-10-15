-- Drop the existing check constraint
ALTER TABLE public.study_group_members 
DROP CONSTRAINT IF EXISTS study_group_members_role_check;

-- Add the updated check constraint that includes 'admin'
ALTER TABLE public.study_group_members 
ADD CONSTRAINT study_group_members_role_check 
CHECK (role IN ('student', 'teacher', 'admin'));