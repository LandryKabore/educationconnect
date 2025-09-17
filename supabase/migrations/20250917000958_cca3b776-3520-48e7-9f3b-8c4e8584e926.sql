-- Create edge function for creating students with temporary credentials
CREATE OR REPLACE FUNCTION create_student_temp_credentials(
  p_first_name text,
  p_middle_name text default null,
  p_last_name text,
  p_school_id uuid,
  p_grade_level text default null,
  p_student_no text default null,
  p_username text,
  p_temp_password text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_user_id uuid;
  v_temp_password_hash text;
  v_result json;
BEGIN
  -- Generate a random user ID for the student
  v_student_user_id := gen_random_uuid();
  
  -- Hash the temporary password
  v_temp_password_hash := encode(digest(p_temp_password, 'sha256'), 'hex');
  
  -- Insert student temporary credentials
  INSERT INTO student_temp_credentials (
    student_user_id,
    username,
    temp_password_hash,
    first_name,
    middle_name,
    last_name,
    school_id,
    grade_level,
    student_no,
    created_by
  ) VALUES (
    v_student_user_id,
    p_username,
    v_temp_password_hash,
    p_first_name,
    p_middle_name,
    p_last_name,
    p_school_id,
    p_grade_level,
    p_student_no,
    auth.uid()
  );

  -- Return success result
  v_result := json_build_object(
    'success', true,
    'student_id', v_student_user_id,
    'username', p_username
  );

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Username already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

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