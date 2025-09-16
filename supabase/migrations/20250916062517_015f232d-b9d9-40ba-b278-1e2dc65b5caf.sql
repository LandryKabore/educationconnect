-- Create table for temporary teacher credentials
CREATE TABLE public.teacher_temp_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  temp_password_hash TEXT NOT NULL,
  teacher_user_id UUID NOT NULL,
  created_by UUID NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days')
);

-- Enable RLS
ALTER TABLE public.teacher_temp_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can manage temp credentials
CREATE POLICY "Admins can manage temp credentials"
ON public.teacher_temp_credentials
FOR ALL
USING (is_admin());

-- Teachers can view their own temp credentials
CREATE POLICY "Teachers can view their temp credentials"
ON public.teacher_temp_credentials
FOR SELECT
USING (teacher_user_id = auth.uid());

-- Add username field to teacher_profiles
ALTER TABLE public.teacher_profiles
ADD COLUMN username TEXT UNIQUE,
ADD COLUMN first_login_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN temp_password_expires_at TIMESTAMP WITH TIME ZONE;