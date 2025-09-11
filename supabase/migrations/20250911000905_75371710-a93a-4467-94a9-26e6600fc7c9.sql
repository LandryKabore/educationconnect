-- Create comprehensive RLS policies for the enhanced education management system

-- Helper function to check if user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Helper function to check if user is a teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'teacher'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Helper function to check if user is a student
CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'student'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Helper function to check if user is a parent
CREATE OR REPLACE FUNCTION public.is_parent()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'parent'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Campuses policies
CREATE POLICY "Admins can manage campuses" ON public.campuses
  FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated users can view campuses" ON public.campuses
  FOR SELECT USING (true);

-- Academic years policies
CREATE POLICY "Admins can manage academic years" ON public.academic_years
  FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated users can view academic years" ON public.academic_years
  FOR SELECT USING (true);

-- Class sections policies
CREATE POLICY "Admins can manage class sections" ON public.class_sections
  FOR ALL USING (public.is_admin());

CREATE POLICY "Teachers can view their assigned class sections" ON public.class_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.class_section_id = class_sections.id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can view their enrolled class sections" ON public.class_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.class_section_id = class_sections.id 
      AND e.student_user_id = auth.uid()
    ) OR public.is_admin() OR public.is_teacher()
  );

CREATE POLICY "Parents can view their children's class sections" ON public.class_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.enrollments e ON e.student_user_id = psl.student_user_id
      WHERE e.class_section_id = class_sections.id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR public.is_student()
  );

-- Teacher profiles policies
CREATE POLICY "Teachers can view and update their own profile" ON public.teacher_profiles
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can manage teacher profiles" ON public.teacher_profiles
  FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated users can view teacher profiles" ON public.teacher_profiles
  FOR SELECT USING (true);

-- Student profiles policies
CREATE POLICY "Students can view and update their own profile" ON public.student_profiles
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can manage student profiles" ON public.student_profiles
  FOR ALL USING (public.is_admin());

CREATE POLICY "Teachers can view student profiles in their classes" ON public.student_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.teaching_assignments ta ON ta.class_section_id = e.class_section_id
      WHERE e.student_user_id = student_profiles.user_id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin() OR user_id = auth.uid()
  );

CREATE POLICY "Parents can view their children's profiles" ON public.student_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.student_user_id = student_profiles.user_id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR user_id = auth.uid()
  );

-- Parent profiles policies
CREATE POLICY "Parents can view and update their own profile" ON public.parent_profiles
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can manage parent profiles" ON public.parent_profiles
  FOR ALL USING (public.is_admin());

-- Enrollments policies
CREATE POLICY "Admins can manage enrollments" ON public.enrollments
  FOR ALL USING (public.is_admin());

CREATE POLICY "Students can view their own enrollments" ON public.enrollments
  FOR SELECT USING (student_user_id = auth.uid());

CREATE POLICY "Teachers can view enrollments for their classes" ON public.enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.class_section_id = enrollments.class_section_id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin() OR student_user_id = auth.uid()
  );

CREATE POLICY "Parents can view their children's enrollments" ON public.enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.student_user_id = enrollments.student_user_id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR student_user_id = auth.uid()
  );

-- Teaching assignments policies
CREATE POLICY "Admins can manage teaching assignments" ON public.teaching_assignments
  FOR ALL USING (public.is_admin());

CREATE POLICY "Teachers can view their own assignments" ON public.teaching_assignments
  FOR SELECT USING (teacher_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Students can view teaching assignments for their classes" ON public.teaching_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.class_section_id = teaching_assignments.class_section_id 
      AND e.student_user_id = auth.uid()
    ) OR public.is_admin() OR teacher_user_id = auth.uid()
  );

-- Exams policies
CREATE POLICY "Teachers can manage exams for their classes" ON public.exams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.class_section_id = exams.class_section_id 
      AND ta.subject_id = exams.subject_id
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can view exams for their classes" ON public.exams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.class_section_id = exams.class_section_id 
      AND e.student_user_id = auth.uid()
    ) OR public.is_admin() OR public.is_teacher()
  );

CREATE POLICY "Parents can view exams for their children's classes" ON public.exams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.enrollments e ON e.student_user_id = psl.student_user_id
      WHERE e.class_section_id = exams.class_section_id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR public.is_student()
  );

-- Enhanced grades policies
CREATE POLICY "Teachers can manage grades for their exams" ON public.enhanced_grades
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.teaching_assignments ta ON ta.class_section_id = e.class_section_id 
        AND ta.subject_id = e.subject_id
      WHERE e.id = enhanced_grades.exam_id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can view their own grades" ON public.enhanced_grades
  FOR SELECT USING (student_user_id = auth.uid());

CREATE POLICY "Parents can view their children's grades" ON public.enhanced_grades
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.student_user_id = enhanced_grades.student_user_id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR student_user_id = auth.uid()
  );

-- Enhanced attendance policies
CREATE POLICY "Teachers can manage attendance for their classes" ON public.enhanced_attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.class_section_id = enhanced_attendance.class_section_id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can view their own attendance" ON public.enhanced_attendance
  FOR SELECT USING (student_user_id = auth.uid());

CREATE POLICY "Parents can view their children's attendance" ON public.enhanced_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.student_user_id = enhanced_attendance.student_user_id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR student_user_id = auth.uid()
  );

-- Resources policies
CREATE POLICY "Teachers can manage resources for their classes" ON public.resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.class_section_id = resources.class_section_id 
      AND ta.subject_id = resources.subject_id
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can view resources for their classes" ON public.resources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.class_section_id = resources.class_section_id 
      AND e.student_user_id = auth.uid()
    ) OR public.is_admin() OR public.is_teacher()
  );

CREATE POLICY "Parents can view resources for their children's classes" ON public.resources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.enrollments e ON e.student_user_id = psl.student_user_id
      WHERE e.class_section_id = resources.class_section_id 
      AND psl.parent_user_id = auth.uid()
      AND psl.status = 'active'
    ) OR public.is_admin() OR public.is_teacher() OR public.is_student()
  );

-- Announcements policies
CREATE POLICY "Teachers and admins can create announcements" ON public.announcements
  FOR INSERT WITH CHECK (public.is_teacher() OR public.is_admin());

CREATE POLICY "Creators and admins can update announcements" ON public.announcements
  FOR UPDATE USING (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "Creators and admins can delete announcements" ON public.announcements
  FOR DELETE USING (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "Users can view announcements based on audience" ON public.announcements
  FOR SELECT USING (
    audience = 'all' OR
    (audience = 'teachers' AND public.is_teacher()) OR
    (audience = 'students' AND public.is_student()) OR
    (audience = 'parents' AND public.is_parent()) OR
    public.is_admin()
  );

-- Study groups policies
CREATE POLICY "Teachers can manage study groups for their classes" ON public.study_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teaching_assignments ta
      WHERE ta.class_section_id = study_groups.class_section_id 
      AND ta.subject_id = study_groups.subject_id
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can view study groups for their classes" ON public.study_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.class_section_id = study_groups.class_section_id 
      AND e.student_user_id = auth.uid()
    ) OR public.is_admin() OR public.is_teacher()
  );

-- Study group members policies
CREATE POLICY "Teachers can manage study group members" ON public.study_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.study_groups sg
      JOIN public.teaching_assignments ta ON ta.class_section_id = sg.class_section_id 
        AND ta.subject_id = sg.subject_id
      WHERE sg.id = study_group_members.study_group_id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Students can join/leave study groups" ON public.study_group_members
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.study_groups sg
      JOIN public.teaching_assignments ta ON ta.class_section_id = sg.class_section_id 
        AND ta.subject_id = sg.subject_id
      WHERE sg.id = study_group_members.study_group_id 
      AND ta.teacher_user_id = auth.uid()
    ) OR public.is_admin()
  );

-- Messages policies
CREATE POLICY "Users can send and receive messages" ON public.messages
  FOR ALL USING (
    sender_user_id = auth.uid() OR 
    recipient_user_id = auth.uid() OR 
    public.is_admin()
  );

-- Parent student links policies
CREATE POLICY "Admins can manage parent student links" ON public.parent_student_links
  FOR ALL USING (public.is_admin());

CREATE POLICY "Parents and students can view their links" ON public.parent_student_links
  FOR SELECT USING (
    parent_user_id = auth.uid() OR 
    student_user_id = auth.uid() OR 
    public.is_admin()
  );

CREATE POLICY "Parents can create verification requests" ON public.parent_student_links
  FOR INSERT WITH CHECK (parent_user_id = auth.uid() OR public.is_admin());