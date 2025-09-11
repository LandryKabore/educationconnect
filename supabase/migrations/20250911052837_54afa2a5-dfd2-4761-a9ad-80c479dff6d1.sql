-- Add school_id to parent_profiles table and update handle_new_user function
ALTER TABLE public.parent_profiles 
ADD COLUMN school_id uuid;

-- Update the handle_new_user function to include school_id for parents
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert into profiles (existing logic)
  INSERT INTO public.profiles (user_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'student')
  );
  
  -- If user is a teacher, create teacher_profiles record
  IF COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'student') = 'teacher' THEN
    INSERT INTO public.teacher_profiles (
      user_id, 
      school_id,
      hire_date
    )
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'school_id')::uuid,
      CURRENT_DATE
    );
  END IF;
  
  -- If user is a student, create student_profiles record
  IF COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'student') = 'student' THEN
    INSERT INTO public.student_profiles (
      user_id,
      school_id
    )
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'school_id')::uuid
    );
  END IF;
  
  -- If user is a parent, create parent_profiles record with school_id
  IF COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'student') = 'parent' THEN
    INSERT INTO public.parent_profiles (
      user_id,
      school_id
    )
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'school_id')::uuid
    );
  END IF;
  
  RETURN NEW;
END;
$function$;