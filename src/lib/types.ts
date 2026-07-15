export type AppRole =
  | "super_admin"
  | "school_admin"
  | "teacher"
  | "student"
  | "parent";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  must_change_password: boolean;
  active: boolean;
  created_at: string;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  school_id: string | null;
  active: boolean;
}

export interface School {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface AcademicYear {
  id: string;
  school_id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface ClassSection {
  id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  grade_level: string;
  capacity: number | null;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  coefficient: number;
}

export interface Enrollment {
  id: string;
  student_id: string;
  class_section_id: string;
  academic_year_id: string;
  status: string;
}

export interface TeachingAssignment {
  id: string;
  teacher_id: string;
  class_section_id: string;
  subject_id: string;
}

export interface ParentStudentLink {
  id: string;
  parent_id: string;
  student_id: string;
  relationship: string | null;
}

export interface AttendanceRow {
  id: string;
  class_section_id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  recorded_by: string | null;
}

export interface GradeRow {
  id: string;
  student_id: string;
  subject_id: string;
  class_section_id: string;
  period_label: string;
  score: number;
  max_score: number;
  comment: string | null;
  recorded_by: string | null;
}

export interface Assignment {
  id: string;
  class_section_id: string;
  subject_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  submitted_at: string | null;
  score: number | null;
}

export interface TimetableSlot {
  id: string;
  class_section_id: string;
  subject_id: string;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
}

export interface MessageRow {
  id: string;
  school_id: string;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/admin/ecoles",
  school_admin: "/ecole",
  teacher: "/tableau-de-bord",
  student: "/tableau-de-bord",
  parent: "/tableau-de-bord",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super administrateur",
  school_admin: "Administrateur d'école",
  teacher: "Enseignant",
  student: "Élève",
  parent: "Parent",
};
