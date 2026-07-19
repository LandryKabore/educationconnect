import type { AttendanceStatus } from "@/lib/types";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Justifié",
};

/** Statuses a teacher can set when taking roll. */
export const TEACHER_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "late",
];

/** Counts as an unjustified absence (for rates / alerts). */
export function isUnjustifiedAbsence(status: AttendanceStatus): boolean {
  return status === "absent";
}

/** Counts toward attendance rate (present-ish). */
export function isAttendancePositive(status: AttendanceStatus): boolean {
  return status === "present" || status === "late" || status === "excused";
}

export const ATTENDANCE_TONE: Record<
  AttendanceStatus,
  "success" | "danger" | "warning" | "info"
> = {
  present: "success",
  absent: "danger",
  late: "warning",
  excused: "info",
};

/** Closed <select> look — options forced dark-on-white (native menus ignore dark theme). */
export function attendanceSelectClass(status: AttendanceStatus | ""): string {
  const options =
    "[&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-white dark:[&>option]:text-slate-900";
  switch (status) {
    case "present":
      return cn(
        options,
        "border-emerald-500 bg-emerald-100 font-semibold text-emerald-900 focus:border-emerald-600 focus:ring-emerald-200 dark:border-emerald-400 dark:bg-emerald-900 dark:text-emerald-50 dark:focus:ring-emerald-800",
      );
    case "absent":
      return cn(
        options,
        "border-rose-500 bg-rose-100 font-semibold text-rose-900 focus:border-rose-600 focus:ring-rose-200 dark:border-rose-400 dark:bg-rose-900 dark:text-rose-50 dark:focus:ring-rose-800",
      );
    case "late":
      return cn(
        options,
        "border-amber-500 bg-amber-100 font-semibold text-amber-950 focus:border-amber-600 focus:ring-amber-200 dark:border-amber-400 dark:bg-amber-900 dark:text-amber-50 dark:focus:ring-amber-800",
      );
    case "excused":
      return cn(
        options,
        "border-sky-500 bg-sky-100 font-semibold text-sky-900 focus:border-sky-600 focus:ring-sky-200 dark:border-sky-400 dark:bg-sky-900 dark:text-sky-50 dark:focus:ring-sky-800",
      );
    default:
      return cn(
        options,
        "border-slate-300 bg-white text-slate-800 focus:border-brand-600 focus:ring-brand-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100",
      );
  }
}

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Toggle buttons for roll call (reliable contrast in light + dark). */
export function attendanceToggleClass(
  status: AttendanceStatus,
  active: boolean,
): string {
  const base =
    "inline-flex h-9 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition sm:px-3 sm:text-sm";
  if (!active) {
    return `${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`;
  }
  switch (status) {
    case "present":
      return `${base} border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600`;
    case "absent":
      return `${base} border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600`;
    case "late":
      return `${base} border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-500`;
    case "excused":
      return `${base} border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-600`;
    default:
      return base;
  }
}
