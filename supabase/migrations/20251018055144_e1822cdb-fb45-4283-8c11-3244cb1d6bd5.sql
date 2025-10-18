-- Complete Phase 1: Add missing columns and create security functions

-- Step 1: Add missing school_id column to existing user_roles table
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Step 2: Rename 'role' column type if needed and add constraint
-- First check if app_role enum exists, create if not
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'school_admin', 
    'teacher',
    'student',
    'parent'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 3: Add created_by column if missing
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Step 4: Update unique constraint to include school_id
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_role_school_id_key 
UNIQUE(user_id, role, school_id);

-- Step 5: Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT, _school_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND active = true
      AND (
        _school_id IS NULL 
        OR school_id = _school_id 
        OR school_id IS NULL
      )
  )
$$;

-- Step 6: Create helper functions for role checking
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_school_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'school_admin', _school_id);
$$;

-- Step 7: Update existing is_admin function to check user_roles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'school_admin')
      AND active = true
  );
$$;

-- Step 8: Update is_teacher function
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'teacher');
$$;

-- Step 9: Update is_student function
CREATE OR REPLACE FUNCTION public.is_student()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'student');
$$;

-- Step 10: Update is_parent function
CREATE OR REPLACE FUNCTION public.is_parent()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'parent');
$$;

-- Step 11: Create function to get user's admin schools
CREATE OR REPLACE FUNCTION public.get_user_admin_schools()
RETURNS TABLE(school_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.school_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.role IN ('super_admin', 'school_admin')
    AND ur.active = true;
$$;

-- Step 12: Migrate existing role data from profiles to user_roles (only if not already migrated)
INSERT INTO public.user_roles (user_id, role, school_id, created_by, active)
SELECT 
  p.user_id,
  CASE 
    WHEN p.role = 'admin' THEN 'super_admin'
    WHEN p.role = 'teacher' THEN 'teacher'
    WHEN p.role = 'student' THEN 'student'
    WHEN p.role = 'parent' THEN 'parent'
  END,
  COALESCE(
    (SELECT school_id FROM public.teacher_profiles WHERE user_id = p.user_id LIMIT 1),
    (SELECT school_id FROM public.student_profiles WHERE user_id = p.user_id LIMIT 1),
    (SELECT school_id FROM public.parent_profiles WHERE user_id = p.user_id LIMIT 1)
  ),
  p.user_id,
  true
FROM public.profiles p
WHERE p.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = p.user_id 
    AND ur.role = CASE 
      WHEN p.role = 'admin' THEN 'super_admin'
      WHEN p.role = 'teacher' THEN 'teacher'
      WHEN p.role = 'student' THEN 'student'
      WHEN p.role = 'parent' THEN 'parent'
    END
  );

-- Step 13: Update handle_new_user trigger to insert into user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  user_school_id UUID;
BEGIN
  -- Determine role from metadata
  user_role := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    'student'
  );
  
  user_school_id := (NEW.raw_user_meta_data ->> 'school_id')::UUID;

  -- Insert into profiles (keep existing logic for backward compatibility)
  INSERT INTO public.profiles (user_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    CASE 
      WHEN user_role IN ('super_admin', 'school_admin') THEN 'admin'::user_role
      WHEN user_role = 'teacher' THEN 'teacher'::user_role
      WHEN user_role = 'student' THEN 'student'::user_role
      WHEN user_role = 'parent' THEN 'parent'::user_role
      ELSE 'student'::user_role
    END
  );

  -- Insert into user_roles (new secure approach)
  INSERT INTO public.user_roles (user_id, role, school_id, active, assigned_by)
  VALUES (NEW.id, user_role, user_school_id, true, NEW.id);
  
  -- Create role-specific profile
  IF user_role = 'teacher' THEN
    INSERT INTO public.teacher_profiles (user_id, school_id, hire_date)
    VALUES (NEW.id, user_school_id, CURRENT_DATE);
  ELSIF user_role = 'student' THEN
    INSERT INTO public.student_profiles (user_id, school_id)
    VALUES (NEW.id, user_school_id);
  ELSIF user_role IN ('parent') THEN
    INSERT INTO public.parent_profiles (user_id, school_id)
    VALUES (NEW.id, user_school_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 14: Update RLS policies for user_roles table
DROP POLICY IF EXISTS "Super admins can manage all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "School admins can manage roles for their school" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Super admins can manage all user roles"
ON public.user_roles
FOR ALL
USING (public.is_super_admin());

CREATE POLICY "School admins can manage roles for their school"
ON public.user_roles
FOR ALL
USING (
  public.is_school_admin(school_id)
  OR public.is_super_admin()
);

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());