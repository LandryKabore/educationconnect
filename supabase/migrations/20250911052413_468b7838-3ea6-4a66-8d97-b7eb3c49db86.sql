-- Ensure handle_new_user trigger exists and backfill missing teacher profiles
-- 1) Create/replace trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill teacher_profiles for existing teachers missing profile
INSERT INTO public.teacher_profiles (user_id, school_id, hire_date)
SELECT u.id, (u.raw_user_meta_data->>'school_id')::uuid, CURRENT_DATE
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.teacher_profiles tp ON tp.user_id = u.id
WHERE p.role = 'teacher'
  AND tp.user_id IS NULL
  AND (u.raw_user_meta_data->>'school_id') IS NOT NULL;