-- Add RLS policy to allow parents to view their children's profiles
CREATE POLICY "Parents can view their children's profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.parent_student_links psl
    WHERE psl.student_user_id = profiles.user_id
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
  )
);