import { TRIMESTER_PERIODS } from "@/lib/averages";

const STORAGE_KEY = "edufaso:grading-period";

/** Calendar-based default when nothing is stored yet (BF school year). */
export function calendarGradingPeriod(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 9) return "Trimestre 1";
  if (month <= 3) return "Trimestre 2";
  return "Trimestre 3";
}

export function readStoredGradingPeriod(
  allowed: readonly string[] = TRIMESTER_PERIODS,
): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && allowed.includes(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredGradingPeriod(period: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, period);
  } catch {
    /* ignore */
  }
}

/** Prefer stored → URL/explicit → calendar → first allowed. Ignores closure. */
export function initialGradingPeriod(
  allowed: readonly string[],
  preferred?: string | null,
): string {
  const stored = readStoredGradingPeriod(allowed);
  if (stored) return stored;
  if (preferred && allowed.includes(preferred)) return preferred;
  const cal = calendarGradingPeriod();
  if (allowed.includes(cal)) return cal;
  return allowed[0] ?? TRIMESTER_PERIODS[0];
}

export type PeriodRange = { start?: string | null; end?: string | null };

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeDays(range: PeriodRange | undefined): number | null {
  const start = range?.start?.slice(0, 10);
  const end = range?.end?.slice(0, 10);
  if (!start || !end) return null;
  const a = Date.parse(`${start}T00:00:00`);
  const b = Date.parse(`${end}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

function containsDay(range: PeriodRange | undefined, day: string): boolean {
  const start = range?.start?.slice(0, 10);
  const end = range?.end?.slice(0, 10);
  if (!start || !end) return false;
  return start <= day && day <= end;
}

/**
 * Automatic period for a dropdown.
 * An explicit choice (URL) is kept even when closed.
 * Otherwise: remembered selection if it is still open, else the period
 * whose dates contain today. A closed choice moves to the next open
 * period, then to the latest open one, then to the last period.
 */
export function pickDefaultPeriod(opts: {
  labels: readonly string[];
  closed?: ReadonlySet<string> | readonly string[];
  ranges?: Readonly<Record<string, PeriodRange>>;
  stored?: string | null;
  explicit?: string | null;
  today?: Date;
}): string {
  const labels = opts.labels.filter((label) => label.length > 0);
  if (labels.length === 0) return "";
  const closed =
    opts.closed instanceof Set ? opts.closed : new Set(opts.closed ?? []);
  const isClosed = (label: string) => closed.has(label);

  if (opts.explicit && labels.includes(opts.explicit)) return opts.explicit;

  const stored =
    opts.stored && labels.includes(opts.stored) ? opts.stored : null;
  if (stored && !isClosed(stored)) return stored;

  const day = isoDay(opts.today ?? new Date());
  const ranges = opts.ranges ?? {};
  const covering = labels
    .filter((label) => containsDay(ranges[label], day))
    .sort((a, b) => {
      const da = rangeDays(ranges[a]) ?? Number.POSITIVE_INFINITY;
      const db = rangeDays(ranges[b]) ?? Number.POSITIVE_INFINITY;
      return da - db || labels.indexOf(a) - labels.indexOf(b);
    });
  const calendar = calendarGradingPeriod();
  const automatic =
    covering[0] ??
    (labels.includes(calendar) ? calendar : null) ??
    labels[0];
  const start = stored && isClosed(stored) ? stored : automatic;
  if (!isClosed(start)) return start;

  const index = Math.max(0, labels.indexOf(start));
  for (let i = index + 1; i < labels.length; i++) {
    if (!isClosed(labels[i])) return labels[i];
  }
  for (let i = labels.length - 1; i >= 0; i--) {
    if (!isClosed(labels[i])) return labels[i];
  }
  return labels[labels.length - 1];
}

/** Dropdown text. The option value stays the plain label. */
export function periodOptionLabel(label: string, closed: boolean): string {
  return closed ? `${label} (clôturé)` : label;
}
