import { differenceInYears, format } from "date-fns";
import { fr } from "date-fns/locale";
import { parseValidDate } from "@/lib/dateFr";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { calendarGradingPeriod } from "@/lib/gradingPeriod";
import type { AttendanceStatus } from "@/lib/types";

/** Below this score (/20) a recent grade is flagged in the « À faire » banner. */
export const LOW_GRADE_ON_20 = 8;
/** How far back absences / low grades count as « to look at ». */
export const TODO_WINDOW_DAYS = 30;
export const LOW_GRADE_WINDOW_DAYS = 14;
const SELECTED_CHILD_KEY = "edufaso:parent-home-child";

export function readSelectedChild(): string | null {
  try {
    return localStorage.getItem(SELECTED_CHILD_KEY);
  } catch {
    return null;
  }
}

export function writeSelectedChild(id: string): void {
  try {
    localStorage.setItem(SELECTED_CHILD_KEY, id);
  } catch {
    /* ignore */
  }
}

export function initials(first?: string | null, last?: string | null): string {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

/** « 12 ans » — null when the birth date is missing or not plausible. */
export function ageLabel(dateOfBirth: string | null | undefined): string | null {
  const d = parseValidDate(dateOfBirth);
  if (!d) return null;
  const years = differenceInYears(new Date(), d);
  if (years < 2 || years > 40) return null;
  return `${years} ans`;
}

/** Avatar colours for the child switcher (stable per position). */
export const CHILD_COLORS = [
  "bg-navy-700 text-white",
  "bg-orange-700 text-white",
  "bg-brand-700 text-white",
  "bg-violet-700 text-white",
] as const;

export function scoreOn20(score: number, max: number): number | null {
  const s = Number(score);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;
  return (s / m) * 20;
}

/** French decimal, one digit: 12,8 */
export function fmt1(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(1).replace(".", ",");
}

export function gradeTone(v: number | null): string {
  if (v === null) return "text-slate-500";
  if (v >= 12) return "text-emerald-700 dark:text-emerald-400";
  if (v >= 8) return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
}

/** French decimal, two digits (as on the Notes page): 12,48 */
export function fmt2(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(2).replace(".", ",");
}

/** « 29 oct. » */
export function shortDateFr(iso: string | null | undefined): string {
  const d = parseValidDate(iso?.length === 10 ? `${iso}T12:00:00` : iso);
  return d ? format(d, "d MMM", { locale: fr }) : "—";
}

/** « lun. 9 nov. » */
export function weekdayDateFr(iso: string | null | undefined): string {
  const d = parseValidDate(iso?.length === 10 ? `${iso}T12:00:00` : iso);
  return d ? format(d, "EEE d MMM", { locale: fr }) : "—";
}

/** The trimester to show: the school year's current one if the child has grades in it, else the latest with grades. */
export function pickAveragePeriod(
  periodsWithGrades: Set<string>,
  /** trimester of the school year (the one the attendance card uses), when known */
  preferred?: string | null,
): {
  current: string | null;
  previous: string | null;
} {
  const order = [...TRIMESTER_PERIODS] as string[];
  const cal =
    preferred && order.includes(preferred) ? preferred : calendarGradingPeriod();
  let current: string | null = null;
  if (periodsWithGrades.has(cal)) current = cal;
  else {
    for (let i = order.length - 1; i >= 0; i--) {
      if (periodsWithGrades.has(order[i])) {
        current = order[i];
        break;
      }
    }
  }
  if (!current) return { current: null, previous: null };
  const idx = order.indexOf(current);
  let previous: string | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (periodsWithGrades.has(order[i])) {
      previous = order[i];
      break;
    }
  }
  return { current, previous };
}

export type StripDay = { date: string; status: AttendanceStatus };

/** One cell per school day (days with at least one record): worst status of the day wins. */
export function buildAttendanceStrip(
  rows: { date: string; status: AttendanceStatus }[],
): StripDay[] {
  const rank: Record<AttendanceStatus, number> = {
    absent: 3,
    late: 2,
    excused: 1,
    present: 0,
  };
  const byDay = new Map<string, AttendanceStatus>();
  for (const r of rows) {
    const cur = byDay.get(r.date);
    if (cur === undefined || rank[r.status] > rank[cur]) byDay.set(r.date, r.status);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, status]) => ({ date, status }));
}

export type TodoItem = {
  key: string;
  tone: "danger" | "warning" | "info";
  text: string;
  detail?: string;
  to: string;
  cta: string;
};

export function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}
