-- 1) Ensure admins can manage schools (INSERT/UPDATE/DELETE/SELECT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'schools' AND policyname = 'Admins can manage schools'
  ) THEN
    EXECUTE $$
      CREATE POLICY "Admins can manage schools" ON public.schools
      FOR ALL
      USING (is_admin())
      WITH CHECK (is_admin());
    $$;
  END IF;
END $$;

-- 2) Allow public (anon) to view schools so signup can list them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'schools' AND policyname = 'Anyone can view schools'
  ) THEN
    EXECUTE $$
      CREATE POLICY "Anyone can view schools" ON public.schools
      FOR SELECT
      USING (true);
    $$;
  END IF;
END $$;

-- 3) Update handle_new_user to also create student/teacher profiles with selected school
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_role user_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'student');
  r_school uuid := NULLIF(NEW.raw_user_meta_data ->> 'school_id', '')::uuid;
BEGIN
  -- Base profile
  INSERT INTO public.profiles (user_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    r_role
  );

  -- Create role-specific profiles if school_id provided
  IF r_role = 'student' AND r_school IS NOT NULL THEN
    INSERT INTO public.student_profiles (user_id, school_id)
    VALUES (NEW.id, r_school);
  ELSIF r_role = 'teacher' AND r_school IS NOT NULL THEN
    INSERT INTO public.teacher_profiles (user_id, school_id)
    VALUES (NEW.id, r_school);
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Create trigger on auth.users to run handle_new_user after signup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    EXECUTE $$
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    $$;
  END IF;
END $$;