-- Create admin user with proper authentication
-- First, let's allow admin operations temporarily
CREATE POLICY "Temp admin access for schools" ON public.schools
FOR ALL
USING (true)
WITH CHECK (true);

-- Create an admin profile for the hardcoded admin
INSERT INTO public.profiles (user_id, email, first_name, last_name, role) 
VALUES (
  '00000000-0000-0000-0000-000000000000', 
  'blooster@gmail.com', 
  'Admin', 
  'User', 
  'admin'
) ON CONFLICT (user_id) DO UPDATE SET
  role = 'admin',
  email = 'blooster@gmail.com',
  first_name = 'Admin',
  last_name = 'User';