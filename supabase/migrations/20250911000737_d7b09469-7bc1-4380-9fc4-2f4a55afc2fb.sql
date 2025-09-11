-- Create enhanced education management system schema

-- Drop existing foreign key constraints and tables that need restructuring
DROP TABLE IF EXISTS parent_student_relationships CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- Create enhanced schools table with additional fields
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS languages text[],
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Create campus/location table
CREATE TABLE public.campuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create academic year table
CREATE TABLE public.academic_years (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  active boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create class sections table (enhanced version of classes)
CREATE TABLE public.class_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  grade_level text NOT NULL,
  name text NOT NULL,
  capacity integer DEFAULT 30,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enhance subjects table with school reference and code
ALTER TABLE subjects 
ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS code text;

-- Add user status and language preference to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS language_pref text DEFAULT 'en';

-- Create teacher profiles table
CREATE TABLE public.teacher_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE UNIQUE,
  staff_no text UNIQUE,
  qualifications text[],
  hire_date date DEFAULT CURRENT_DATE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create student profiles table
CREATE TABLE public.student_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE UNIQUE,
  student_no text UNIQUE,
  dob date,
  gender text,
  guardian_primary_contact text,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create parent profiles table
CREATE TABLE public.parent_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE UNIQUE,
  relationship_to_student text DEFAULT 'parent',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create enrollment table
CREATE TABLE public.enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  date_enrolled date DEFAULT CURRENT_DATE,
  status text DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(student_user_id, class_section_id, academic_year_id)
);

-- Create teaching assignments table
CREATE TABLE public.teaching_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(teacher_user_id, class_section_id, subject_id, academic_year_id)
);

-- Create exams table
CREATE TABLE public.exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  exam_date date NOT NULL,
  weight numeric DEFAULT 1.0,
  term text,
  max_score numeric DEFAULT 100,
  created_by uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create enhanced grades table
CREATE TABLE public.enhanced_grades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  max_score numeric NOT NULL,
  comment text,
  graded_by uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(student_user_id, exam_id)
);

-- Create enhanced attendance table
CREATE TABLE public.enhanced_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
  taken_by uuid NOT NULL REFERENCES profiles(user_id),
  synced boolean DEFAULT true,
  device_timestamp timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(student_user_id, class_section_id, date)
);

-- Create resources table
CREATE TABLE public.resources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  file_url text,
  uploaded_by uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create announcements table
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  class_section_id uuid REFERENCES class_sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'parents', 'students', 'teachers')),
  created_by uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create study groups table
CREATE TABLE public.study_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  moderated_by_teacher_id uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create study group members table
CREATE TABLE public.study_group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(study_group_id, user_id)
);

-- Create messages table
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  subject text,
  body text NOT NULL,
  attachments text[],
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create parent student links table
CREATE TABLE public.parent_student_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  verification_method text DEFAULT 'admin_link' CHECK (verification_method IN ('code', 'admin_link', 'invite')),
  verification_code text,
  status text DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(parent_user_id, student_user_id)
);

-- Add triggers for updated_at columns
CREATE TRIGGER update_campuses_updated_at BEFORE UPDATE ON public.campuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_academic_years_updated_at BEFORE UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_class_sections_updated_at BEFORE UPDATE ON public.class_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teacher_profiles_updated_at BEFORE UPDATE ON public.teacher_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_student_profiles_updated_at BEFORE UPDATE ON public.student_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_parent_profiles_updated_at BEFORE UPDATE ON public.parent_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teaching_assignments_updated_at BEFORE UPDATE ON public.teaching_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_enhanced_grades_updated_at BEFORE UPDATE ON public.enhanced_grades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_enhanced_attendance_updated_at BEFORE UPDATE ON public.enhanced_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_study_groups_updated_at BEFORE UPDATE ON public.study_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_parent_student_links_updated_at BEFORE UPDATE ON public.parent_student_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enhanced_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enhanced_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;