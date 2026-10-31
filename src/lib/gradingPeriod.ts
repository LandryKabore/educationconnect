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

/** Prefer stored → URL/explicit → calendar → first allowed. */
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
