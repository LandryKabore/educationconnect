-- Create a junction table to link class sections with subjects
CREATE TABLE IF NOT EXISTS public.class_section_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_section_id uuid REFERENCES public.class_sections(id) ON DELETE CASCADE NOT NULL,
    subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
    teacher_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(class_section_id, subject_id)
);

-- Enable RLS on class_section_subjects table
ALTER TABLE public.class_section_subjects ENABLE ROW LEVEL SECURITY;

-- RLS policies for class_section_subjects table
CREATE POLICY "Admins can manage class section subjects" 
ON public.class_section_subjects 
FOR ALL 
TO authenticated
USING (is_admin());

CREATE POLICY "Students can view subjects for their classes" 
ON public.class_section_subjects 
FOR SELECT 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM enrollments e 
        WHERE e.class_section_id = class_section_subjects.class_section_id 
        AND e.student_user_id = auth.uid()
    ) 
    OR is_admin() 
    OR is_teacher()
);

CREATE POLICY "Teachers can view class section subjects" 
ON public.class_section_subjects 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Parents can view subjects for their children's classes" 
ON public.class_section_subjects 
FOR SELECT 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM parent_student_links psl
        JOIN enrollments e ON e.student_user_id = psl.student_user_id
        WHERE e.class_section_id = class_section_subjects.class_section_id 
        AND psl.parent_user_id = auth.uid() 
        AND psl.status = 'active'
    ) 
    OR is_admin() 
    OR is_teacher() 
    OR is_student()
);

-- Add trigger for updated_at on class_section_subjects
CREATE TRIGGER update_class_section_subjects_updated_at
    BEFORE UPDATE ON public.class_section_subjects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();