-- Add admin policies for schools table
CREATE POLICY "Admins can manage schools" ON public.schools
FOR ALL 
USING (is_admin());

-- Add admin policies for campuses table  
CREATE POLICY "Admins can manage campuses" ON public.campuses
FOR ALL 
USING (is_admin());

-- Add admin policies for subjects table
CREATE POLICY "Admins can manage subjects" ON public.subjects
FOR ALL 
USING (is_admin());

-- Add admin policies for academic_years table
CREATE POLICY "Admins can manage academic_years" ON public.academic_years
FOR ALL 
USING (is_admin());

-- Add admin policies for class_sections table
CREATE POLICY "Admins can manage class_sections" ON public.class_sections
FOR ALL 
USING (is_admin());