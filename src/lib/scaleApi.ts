import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

/**
 * Thin wrappers around the "scale pack" database functions
 * (see supabase/migrations/20261101130000_scale_rpcs.sql).
 *
 * Why: the API never returns more than 1,000 rows, so anything that was
 * counted or searched in the browser was silently cut off in big schools.
 * These functions page, search and count inside the database.  They run
 * with the caller's own permissions (row-level security still applies).
 */

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export type Cred = {
  username: string | null;
  tempPassword: string | null;
  used: boolean;
} | null;

export type Page<T> = { total: number; rows: T[] };

export type StudentPageRow = Profile & {
  className: string | null;
  classSectionId: string | null;
  cred: Cred;
  /** only set in the "Anciens élèves" list */
  exit?: { leftAt: string; reason: string; className: string | null } | null;
};

export type ParentPageRow = Profile & {
  children: string[];
  cred: Cred;
};

export const PAGE_SIZE = 100;

/** `classId`: "" = all, "__none__" = students without a class, "__former__" = former pupils (left the school), else a class id. */
export function fetchStudentsPage(
  schoolId: string,
  opts: { classId?: string; search?: string; limit?: number; offset?: number } = {},
) {
  return rpc<Page<StudentPageRow>>("ef_students_page", {
    p_school: schoolId,
    p_class: opts.classId ?? "",
    p_search: opts.search ?? "",
    p_limit: opts.limit ?? PAGE_SIZE,
    p_offset: opts.offset ?? 0,
  });
}

/** Every student of a class / selection, fetched page by page (for CSV export). */
export async function fetchAllStudents(
  schoolId: string,
  opts: { classId?: string; search?: string } = {},
): Promise<StudentPageRow[]> {
  const out: StudentPageRow[] = [];
  const step = 500;
  for (let offset = 0; ; offset += step) {
    const page = await fetchStudentsPage(schoolId, { ...opts, limit: step, offset });
    out.push(...page.rows);
    if (page.rows.length < step || out.length >= page.total) break;
  }
  return out;
}

export function fetchParentsPage(
  schoolId: string,
  opts: { search?: string; limit?: number; offset?: number } = {},
) {
  return rpc<Page<ParentPageRow>>("ef_parents_page", {
    p_school: schoolId,
    p_search: opts.search ?? "",
    p_limit: opts.limit ?? PAGE_SIZE,
    p_offset: opts.offset ?? 0,
  });
}

export async function fetchAllParents(
  schoolId: string,
  opts: { search?: string } = {},
): Promise<ParentPageRow[]> {
  const out: ParentPageRow[] = [];
  const step = 500;
  for (let offset = 0; ; offset += step) {
    const page = await fetchParentsPage(schoolId, { ...opts, limit: step, offset });
    out.push(...page.rows);
    if (page.rows.length < step || out.length >= page.total) break;
  }
  return out;
}

export type PickerStudent = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  className: string | null;
};

export function searchStudentsForPicker(schoolId: string, search: string, limit = 40) {
  return rpc<PickerStudent[]>("ef_student_picker", {
    p_school: schoolId,
    p_search: search,
    p_limit: limit,
  });
}

export type StudentsWithoutClass = {
  count: number;
  sample: { id: string; name: string }[];
};

export function fetchStudentsWithoutClass(schoolId: string, sample = 0) {
  return rpc<StudentsWithoutClass>("ef_students_without_class", {
    p_school: schoolId,
    p_sample: sample,
  });
}

export function fetchClassStudentCounts(schoolId: string) {
  return rpc<Record<string, number>>("ef_class_student_counts", { p_school: schoolId });
}

export function fetchProgrammeCounts(schoolId: string) {
  return rpc<Record<string, number>>("ef_programme_counts", { p_school: schoolId });
}

export type SchoolSetupCounts = {
  classesWithProgramme: number;
  enrollments: number;
  assignments: number;
  timetableSlots: number;
};

export function fetchSchoolSetupCounts(schoolId: string) {
  return rpc<SchoolSetupCounts>("ef_school_setup_counts", { p_school: schoolId });
}

export type AttendanceSummary = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
};

export function fetchAttendanceDaySummary(
  schoolId: string,
  date: string,
  classId?: string,
) {
  return rpc<AttendanceSummary>("ef_attendance_day_summary", {
    p_school: schoolId,
    p_date: date,
    p_class: classId || null,
  });
}

export type SchoolHomeStats = {
  absent: number;
  late: number;
  excused: number;
  classesWithEdt: number;
  todaySlotCount: number;
  classesWithoutEdt: { id: string; name: string }[];
  studentsWithoutClass: StudentsWithoutClass;
};

export function fetchSchoolHomeStats(schoolId: string, date: string, dow: number) {
  return rpc<SchoolHomeStats>("ef_school_home_stats", {
    p_school: schoolId,
    p_date: date,
    p_dow: dow,
  });
}

export type StudentAttendanceCounts = AttendanceSummary & {
  bySubject: {
    subjectId: string | null;
    name: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
  }[];
};

export function fetchAttendanceCounts(studentId: string) {
  return rpc<StudentAttendanceCounts>("ef_attendance_counts", { p_student: studentId });
}

export type TeacherClassStats = {
  counts: Record<string, number>;
  averages: { classId: string; subjectId: string; avg: number; n: number }[];
};

export function fetchTeacherClassStats(classIds: string[]) {
  return rpc<TeacherClassStats>("ef_teacher_class_stats", { p_class_ids: classIds });
}

export type ChildSummary = {
  id: string;
  first_name: string;
  last_name: string;
  className: string | null;
  absences: number;
  notesCount: number;
  recentNotes: {
    id: string;
    score: number;
    max_score: number;
    period_label: string;
    created_at: string;
    is_absent: boolean;
    subject: string | null;
  }[];
};

export function fetchMyChildrenSummary() {
  return rpc<ChildSummary[]>("ef_my_children_summary");
}

export type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: "student" | "parent" | "teacher" | "school_admin";
  class_name: string | null;
  date_of_birth: string | null;
};

export function fetchMessageContacts(schoolId: string, role: string) {
  return rpc<ContactRow[]>("ef_message_contacts", { p_school: schoolId, p_role: role });
}

export function fetchSentAnnouncements(limit = 100) {
  return rpc<(Record<string, unknown> & { recipientCount: number })[]>(
    "ef_sent_announcements",
    { p_limit: limit },
  );
}

export type AdminUserRow = Profile & {
  roles: {
    id: string;
    user_id: string;
    role: string;
    school_id: string | null;
    active: boolean;
  }[];
  schoolNames: string[];
  schoolIds: string[];
  classId: string | null;
  className: string | null;
  classSchoolId: string | null;
};

export function fetchAdminUsersPage(opts: {
  role: string;
  schoolId?: string;
  classId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return rpc<Page<AdminUserRow>>("ef_admin_users_page", {
    p_role: opts.role,
    p_school: opts.schoolId || null,
    p_class: opts.classId ?? "",
    p_search: opts.search ?? "",
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
}

export type AdminUsersFacets = {
  roleCounts: Record<string, number>;
  schools: { id: string; name: string; count: number }[];
  classes: { id: string; name: string; schoolId: string; count: number }[];
  noClass: number;
};

export function fetchAdminUsersFacets(role: string, schoolId?: string) {
  return rpc<AdminUsersFacets>("ef_admin_users_facets", {
    p_role: role,
    p_school: schoolId || null,
  });
}

/**
 * Teachers of ONE school, paged and searched by the database (same function the super
 * admin's user list uses).  The school id is always sent, and row-level security still
 * limits what the caller can read.
 */
export function fetchTeachersPage(
  schoolId: string,
  opts: { search?: string; limit?: number; offset?: number } = {},
) {
  return fetchAdminUsersPage({
    role: "teacher",
    schoolId,
    search: opts.search,
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
}

export async function fetchAllTeachers(
  schoolId: string,
  opts: { search?: string } = {},
): Promise<AdminUserRow[]> {
  const out: AdminUserRow[] = [];
  const step = 200;
  for (let offset = 0; ; offset += step) {
    const page = await fetchTeachersPage(schoolId, { ...opts, limit: step, offset });
    out.push(...page.rows);
    if (page.rows.length < step || out.length >= page.total) break;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * nov3: départs & parcours (#30), cahier de textes (#31), statistiques (#32), compte famille (#33)
 * (see supabase/migrations/2026110310*, 2026110311*, 2026110312*, 2026110313*)
 * ---------------------------------------------------------------------------------------------- */

export const EXIT_REASONS = [
  { value: "transfert", label: "Transfert vers une autre école" },
  { value: "abandon", label: "Abandon" },
  { value: "demenagement", label: "Déménagement" },
  { value: "exclusion", label: "Exclusion" },
  { value: "deces", label: "Décès" },
  { value: "autre", label: "Autre motif" },
] as const;

export function exitReasonLabel(reason: string | null | undefined): string {
  return EXIT_REASONS.find((r) => r.value === reason)?.label ?? "—";
}

export type StudentExitInfo = { leftAt: string; reason: string; className: string | null };

export function studentExit(studentId: string, reason: string, leftAt: string, note?: string) {
  return rpc<{ ok: boolean }>("ef_student_exit", {
    p_student: studentId,
    p_reason: reason,
    p_left_at: leftAt,
    p_note: note?.trim() ? note.trim() : null,
  });
}

export function studentReinstate(studentId: string, classId?: string | null) {
  return rpc<{ ok: boolean }>("ef_student_reinstate", {
    p_student: studentId,
    p_class: classId || null,
  });
}

export function fetchDeparturesSummary(schoolId: string) {
  return rpc<{ total: number; byReason: Record<string, number> }>("ef_departures_summary", {
    p_school: schoolId,
  });
}

export type ParcoursRow = {
  id: string;
  class_name: string | null;
  year_label: string | null;
  from_date: string;
  to_date: string | null;
  entry_kind: "inscription" | "changement_classe" | "reintegration";
  end_kind: "changement_classe" | "sortie" | null;
  exit_reason: string | null;
};

/** Class history of one pupil (row-level security: pupil, parents, school admin). */
export async function fetchParcours(studentId: string): Promise<ParcoursRow[]> {
  const { data, error } = await supabase
    .from("parcours_eleve")
    .select("id, class_name, year_label, from_date, to_date, entry_kind, end_kind, exit_reason")
    .eq("student_id", studentId)
    .order("from_date", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ParcoursRow[];
}

export type HomeworkItem = {
  id: string;
  entryDate: string;
  dueDate: string | null;
  classId: string;
  className: string;
  subject: string;
  teacher: string | null;
  homework: string;
  content: string | null;
  children: { id: string; name: string }[];
};

/** Homework due between two dates (yyyy-mm-dd) for the pupil or the parent's children. */
export function fetchHomeworkUpcoming(from: string, to: string) {
  return rpc<HomeworkItem[]>("ef_homework_upcoming", { p_from: from, p_to: to });
}

export type CahierFeedItem = {
  id: string;
  entryDate: string;
  dueDate: string | null;
  subject: string;
  subjectId: string;
  teacher: string | null;
  teacherId: string;
  content: string | null;
  homework: string | null;
  creneauId: string | null;
};

export function fetchCahierFeed(classId: string, opts: { from?: string; to?: string; limit?: number } = {}) {
  return rpc<CahierFeedItem[]>("ef_cahier_feed", {
    p_class: classId,
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
    p_limit: opts.limit ?? 100,
  });
}

export type CahierCoverageRow = {
  classId: string;
  className: string;
  subjectId: string;
  subject: string;
  teacherId: string | null;
  teacher: string | null;
  entries: number;
  lastDate: string | null;
  slotsPerWeek: number;
};

export function fetchCahierCoverage(schoolId: string, from: string, to: string) {
  return rpc<CahierCoverageRow[]>("ef_cahier_coverage", { p_school: schoolId, p_from: from, p_to: to });
}

export type SchoolStatistics = {
  year: { id: string; label: string; startDate: string; endDate: string; isCurrent: boolean } | null;
  totals?: { students: number; male: number; female: number; unknownSex: number; unknownBirth: number; classes: number };
  byClass?: {
    classId: string; name: string; grade: string | null; total: number; male: number; female: number; unknownSex: number;
    attendanceRecords: number; absent: number; late: number; excused: number;
    graded: number; passed: number; average: number | null;
  }[];
  byLevel?: {
    grade: string | null; classes: number; total: number; male: number; female: number; unknownSex: number;
    graded: number; passed: number; average: number | null;
    gradedMale: number; passedMale: number; gradedFemale: number; passedFemale: number;
  }[];
  ages?: { age: number; male: number; female: number; unknownSex: number }[];
  departures?: { total: number; male: number; female: number; unknownSex: number; byReason: Record<string, number> };
  attendance?: { records: number; absent: number; late: number; excused: number };
  results?: {
    graded: number; passed: number; gradedMale: number; passedMale: number;
    gradedFemale: number; passedFemale: number; average: number | null;
  };
};

export function fetchSchoolStatistics(schoolId: string, yearId?: string | null) {
  return rpc<SchoolStatistics>("ef_school_statistics", { p_school: schoolId, p_year: yearId || null });
}

export type IdentityGaps = {
  total: number;
  missingGender: number;
  missingDob: number;
  rows: { id: string; firstName: string; lastName: string; className: string; gender: string | null; dateOfBirth: string | null }[];
};

export function fetchIdentityGaps(schoolId: string, limit = 50, offset = 0) {
  return rpc<IdentityGaps>("ef_identity_gaps", { p_school: schoolId, p_limit: limit, p_offset: offset });
}

export function setStudentIdentity(studentId: string, gender: string | null, dob: string | null) {
  return rpc<{ ok: boolean }>("ef_set_student_identity", {
    p_student: studentId,
    p_gender: gender || null,
    p_dob: dob || null,
  });
}

/** "Own account from this level": pupils in lower levels only have the parent account. */
export const FAMILY_LEVELS = [
  { value: "cp2", label: "CP2" },
  { value: "ce1", label: "CE1" },
  { value: "ce2", label: "CE2" },
  { value: "cm1", label: "CM1" },
  { value: "cm2", label: "CM2" },
  { value: "6eme", label: "6e" },
  { value: "5eme", label: "5e" },
  { value: "4eme", label: "4e" },
  { value: "3eme", label: "3e" },
  { value: "seconde", label: "Seconde" },
  { value: "premiere", label: "Première" },
  { value: "terminale", label: "Terminale" },
] as const;

export type FamilyOverview = {
  level: string | null;
  managed: number;
  belowLevelWithLogin: number;
  belowLevelNeverLoggedIn: number;
  managedWithoutParent: number;
  withoutParentSample: { id: string; name: string; className: string | null }[];
};

export function fetchFamilyOverview(schoolId: string) {
  return rpc<FamilyOverview>("ef_family_overview", { p_school: schoolId });
}

/** level = null turns the setting off. */
export function setFamilyAccountsLevel(schoolId: string, level: string | null) {
  return rpc<{ ok: boolean }>("ef_set_family_accounts_level", { p_school: schoolId, p_level: level });
}
