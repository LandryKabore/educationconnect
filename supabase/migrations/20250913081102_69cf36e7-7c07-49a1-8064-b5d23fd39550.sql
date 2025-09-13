-- Fix RLS policy for teaching assignments to allow teachers to create their own assignments
DROP POLICY IF EXISTS "Teachers can insert teaching assignments" ON teaching_assignments;

CREATE POLICY "Teachers can insert teaching assignments" 
ON teaching_assignments 
FOR INSERT 
TO authenticated
WITH CHECK (is_teacher() OR is_admin());

-- Create a dedicated user_roles table for better role management
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role text NOT NULL,
    assigned_by uuid REFERENCES auth.users(id),
    assigned_at timestamp with time zone DEFAULT now(),
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(user_id, role)
);

-- Enable RLS on user_roles table
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_roles table
CREATE POLICY "Admins can manage all user roles" 
ON public.user_roles 
FOR ALL 
TO authenticated
USING (is_admin());

CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid() OR is_admin());

-- Add trigger for updated_at on user_roles
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Populate user_roles table with existing data from profiles
INSERT INTO public.user_roles (user_id, role, assigned_by, active)
SELECT 
    user_id, 
    role::text, 
    (SELECT user_id FROM profiles WHERE role = 'admin' LIMIT 1),
    true
FROM profiles
ON CONFLICT (user_id, role) DO NOTHING;