-- Add DELETE policy for profiles table to allow admins to delete user profiles
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
TO public
USING (is_admin());