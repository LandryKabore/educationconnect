-- Create function to create teacher account (admin only)
CREATE OR REPLACE FUNCTION public.create_teacher_account(
  teacher_email TEXT,
  teacher_first_name TEXT,
  teacher_last_name TEXT,
  teacher_phone TEXT DEFAULT NULL,
  teacher_school_id UUID,
  teacher_staff_no TEXT DEFAULT NULL,
  teacher_qualifications TEXT[] DEFAULT NULL,
  class_section_ids UUID[] DEFAULT ARRAY[]::UUID[],
  subject_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id UUID;
  new_user_record JSON;
  current_academic_year_id UUID;
  assignment_record RECORD;
  magic_token TEXT;
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can create teacher accounts';
  END IF;

  -- Create auth user with service role
  SELECT auth.admin_create_user(
    jsonb_build_object(
      'email', teacher_email,
      'email_confirm', true,
      'user_metadata', jsonb_build_object(
        'first_name', teacher_first_name,
        'last_name', teacher_last_name,
        'role', 'teacher',
        'school_id', teacher_school_id
      )
    )
  ) INTO new_user_record;

  -- Extract user ID from the returned JSON
  new_user_id := (new_user_record->>'id')::UUID;

  -- Create profile
  INSERT INTO public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    role
  ) VALUES (
    new_user_id,
    teacher_email,
    teacher_first_name,
    teacher_last_name,
    'teacher'::user_role
  );

  -- Create teacher profile
  INSERT INTO public.teacher_profiles (
    user_id,
    school_id,
    staff_no,
    qualifications,
    phone,
    hire_date
  ) VALUES (
    new_user_id,
    teacher_school_id,
    teacher_staff_no,
    teacher_qualifications,
    teacher_phone,
    CURRENT_DATE
  );

  -- Get current academic year
  SELECT id INTO current_academic_year_id
  FROM public.academic_years
  WHERE school_id = teacher_school_id
    AND active = true
  LIMIT 1;

  -- Create teaching assignments if academic year exists
  IF current_academic_year_id IS NOT NULL AND array_length(class_section_ids, 1) > 0 AND array_length(subject_ids, 1) > 0 THEN
    FOR i IN 1..array_length(class_section_ids, 1) LOOP
      FOR j IN 1..array_length(subject_ids, 1) LOOP
        INSERT INTO public.teaching_assignments (
          teacher_user_id,
          class_section_id,
          subject_id,
          academic_year_id
        ) VALUES (
          new_user_id,
          class_section_ids[i],
          subject_ids[j],
          current_academic_year_id
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Generate magic link
  SELECT public.generate_magic_link(new_user_id) INTO magic_token;

  RETURN json_build_object(
    'user_id', new_user_id,
    'magic_token', magic_token,
    'success', true
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create teacher: %', SQLERRM;
END;
$$;