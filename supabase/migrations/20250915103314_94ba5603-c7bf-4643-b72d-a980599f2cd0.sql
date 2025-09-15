-- Add PIN authentication and magic link support to teacher profiles
ALTER TABLE public.teacher_profiles 
ADD COLUMN pin_hash TEXT,
ADD COLUMN pin_set_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_magic_link_sent TIMESTAMP WITH TIME ZONE,
ADD COLUMN phone TEXT;

-- Create a table to track magic link tokens
CREATE TABLE public.magic_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on magic_links
ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;

-- Create policy for magic_links
CREATE POLICY "Users can access their own magic links" 
ON public.magic_links 
FOR SELECT 
USING (user_id = auth.uid() OR is_admin());

-- Create function to generate magic link token
CREATE OR REPLACE FUNCTION public.generate_magic_link(teacher_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_value TEXT;
  expiry_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Only admins can generate magic links
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can generate magic links';
  END IF;
  
  -- Generate random token
  token_value := encode(gen_random_bytes(32), 'base64');
  expiry_time := now() + interval '24 hours';
  
  -- Insert magic link record
  INSERT INTO public.magic_links (user_id, token, expires_at)
  VALUES (teacher_user_id, token_value, expiry_time);
  
  -- Update teacher profile with last sent timestamp
  UPDATE public.teacher_profiles 
  SET last_magic_link_sent = now()
  WHERE user_id = teacher_user_id;
  
  RETURN token_value;
END;
$$;

-- Create function to verify magic link and set PIN
CREATE OR REPLACE FUNCTION public.verify_magic_link_and_set_pin(token_value TEXT, new_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_record magic_links%ROWTYPE;
  pin_hash_value TEXT;
  result JSON;
BEGIN
  -- Find and validate magic link
  SELECT * INTO link_record 
  FROM public.magic_links 
  WHERE token = token_value 
    AND expires_at > now() 
    AND used_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired magic link');
  END IF;
  
  -- Hash the PIN (simple hash for demo - in production use proper password hashing)
  pin_hash_value := crypt(new_pin, gen_salt('bf'));
  
  -- Update teacher profile with PIN
  UPDATE public.teacher_profiles 
  SET pin_hash = pin_hash_value, pin_set_at = now()
  WHERE user_id = link_record.user_id;
  
  -- Mark magic link as used
  UPDATE public.magic_links 
  SET used_at = now()
  WHERE id = link_record.id;
  
  -- Sign in the user (create a session)
  -- Note: This would typically be handled by the auth system
  
  RETURN json_build_object('success', true, 'user_id', link_record.user_id);
END;
$$;