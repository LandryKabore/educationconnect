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
};

export type ParentPageRow = Profile & {
  children: string[];
  cred: Cred;
};

export const PAGE_SIZE = 100;

/** `classId`: "" = all, "__none__" = students without a class, else a class id. */
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
