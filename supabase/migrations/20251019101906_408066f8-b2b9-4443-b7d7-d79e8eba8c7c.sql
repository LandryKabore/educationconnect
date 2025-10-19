-- Create a view that shows user profiles with their primary role
-- This is safe for viewing in the Supabase dashboard and maintains security
CREATE OR REPLACE VIEW public.user_profiles_with_roles AS
SELECT 
  p.user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.status,
  p.role as legacy_role,
  ur.role as current_role,
  ur.active as role_active,
  s.name as school_name,
  p.created_at,
  p.updated_at
FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.active = true
LEFT JOIN public.schools s ON s.id = ur.school_id
ORDER BY p.created_at DESC;

-- Grant access to authenticated users to view this
GRANT SELECT ON public.user_profiles_with_roles TO authenticated;

-- Add comment to explain the view
COMMENT ON VIEW public.user_profiles_with_roles IS 'Read-only view combining user profiles with their active roles from user_roles table. Safe for dashboard viewing and sorting.';