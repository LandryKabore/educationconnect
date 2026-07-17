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
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  matricule?: string | null;
  must_change_password: boolean;
  last_login_at?: string | null;
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
  email: string | null;
  region: string | null;
  school_type: string | null;
  plan: string | null;
  billing_status: string | null;
  subscription_ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface PlatformSettings {
  id: number;
  invite_site_url: string;
  app_name: string;
  support_email: string | null;
  default_year_label: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: AppRole;
  school_id: string | null;
  first_name: string;
  last_name: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
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
  /** Default school-wide coefficient; overridden per class in programme_classe */
  coefficient: number;
}

export interface ClassProgrammeRow {
  id: string;
  class_section_id: string;
  subject_id: string;
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
  teacher_id: string;
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
  allow_replies: boolean;
  parent_message_id: string | null;
}

export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/admin",
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
