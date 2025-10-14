-- Create teacher_tasks table
CREATE TABLE IF NOT EXISTS public.teacher_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teacher_tasks ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own tasks
CREATE POLICY "Teachers can view their own tasks"
ON public.teacher_tasks
FOR SELECT
USING (teacher_user_id = auth.uid() OR is_admin());

-- Teachers can create their own tasks
CREATE POLICY "Teachers can create their own tasks"
ON public.teacher_tasks
FOR INSERT
WITH CHECK (teacher_user_id = auth.uid() OR is_admin());

-- Teachers can update their own tasks
CREATE POLICY "Teachers can update their own tasks"
ON public.teacher_tasks
FOR UPDATE
USING (teacher_user_id = auth.uid() OR is_admin());

-- Teachers can delete their own tasks
CREATE POLICY "Teachers can delete their own tasks"
ON public.teacher_tasks
FOR DELETE
USING (teacher_user_id = auth.uid() OR is_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_teacher_tasks_updated_at
BEFORE UPDATE ON public.teacher_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();