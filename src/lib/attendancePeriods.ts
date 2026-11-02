import { endOfMonth, format, startOfMonth } from "date-fns";

export type AttendancePeriodKey = "month" | "trimester" | "year" | "all";

export type AttendancePeriod = {
  key: AttendancePeriodKey;
  label: string;
  /** yyyy-MM-dd, null = no lower bound */
  from: string | null;
  to: string | null;
};

export type SchoolYearDates = { start_date: string; end_date: string };
export type CustomPeriod = {
  label: string;
  start_date: string | null;
  end_date: string | null;
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * The three trimesters of the school year.  Uses the dates the school typed on the
 * « Périodes » page when there are some, otherwise the year cut in three equal parts
 * (the same rule the database uses for the bulletins).
 */
export function trimesterRanges(
  year: SchoolYearDates,
  custom: CustomPeriod[],
): { label: string; from: string; to: string }[] {
  const start = parseDay(year.start_date);
  const end = parseDay(year.end_date);
  const len = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return [1, 2, 3].map((n) => {
    const label = `Trimestre ${n}`;
    const own = custom.find((c) => c.label.trim() === label);
    if (own?.start_date && own.end_date) {
      return { label, from: own.start_date, to: own.end_date };
    }
    const from = addDays(start, Math.floor(((n - 1) * len) / 3));
    const to = n === 3 ? end : addDays(start, Math.floor((n * len) / 3) - 1);
    return { label, from: iso(from), to: iso(to) };
  });
}

/** Period choices of the attendance screens: this month, current trimester, year, everything. */
export function buildAttendancePeriods(
  today: Date,
  year: SchoolYearDates | null,
  custom: CustomPeriod[] = [],
): AttendancePeriod[] {
  const out: AttendancePeriod[] = [
    {
      key: "month",
      label: "Ce mois",
      from: iso(startOfMonth(today)),
      to: iso(endOfMonth(today)),
    },
  ];
  if (year) {
    const t = iso(today);
    const ranges = trimesterRanges(year, custom);
    const current =
      ranges.find((r) => t >= r.from && t <= r.to) ??
      (t < ranges[0].from ? ranges[0] : ranges[2]);
    out.push({ key: "trimester", label: current.label, from: current.from, to: current.to });
    out.push({ key: "year", label: "Année", from: year.start_date, to: year.end_date });
  }
  out.push({ key: "all", label: "Tout", from: null, to: null });
  return out;
}
