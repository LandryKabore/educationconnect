-- Create table for student temporary credentials
CREATE TABLE IF NOT EXISTS student_temp_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_user_id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  temp_password_hash text NOT NULL,
  first_name text,
  middle_name text,
  last_name text,
  school_id uuid,
  grade_level text,
  student_no text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '30 days'),
  used_at timestamp with time zone,
  is_used boolean DEFAULT false
);

-- Enable RLS on student_temp_credentials
ALTER TABLE student_temp_credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for student_temp_credentials
CREATE POLICY "Admins can manage student temp credentials"
ON student_temp_credentials
FOR ALL
USING (is_admin());

CREATE POLICY "Students can view their temp credentials"
ON student_temp_credentials
FOR SELECT
USING (student_user_id = auth.uid());