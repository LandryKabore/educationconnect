-- RLS policy fixes for tables without policies

-- Schools: allow authenticated users to read
CREATE POLICY "Authenticated can read schools" ON public.schools
FOR SELECT TO authenticated
USING (true);

-- Classes: allow authenticated users to read
CREATE POLICY "Authenticated can read classes" ON public.classes
FOR SELECT TO authenticated
USING (true);

-- Subjects: allow authenticated users to read
CREATE POLICY "Authenticated can read subjects" ON public.subjects
FOR SELECT TO authenticated
USING (true);

-- Assignments: allow authenticated users to read; writes are restricted by default
CREATE POLICY "Authenticated can read assignments" ON public.assignments
FOR SELECT TO authenticated
USING (true);

-- Teachers: allow each teacher to view their own teacher record
CREATE POLICY "Teacher can view own teacher record" ON public.teachers
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Parent-student relationships: allow parent or student to read association rows
CREATE POLICY "Parents or students can view relationships" ON public.parent_student_relationships
FOR SELECT TO authenticated
USING (auth.uid() = parent_id OR auth.uid() = student_id);
