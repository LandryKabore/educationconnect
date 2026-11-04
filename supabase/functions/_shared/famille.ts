// Small pure helpers shared by importer-eleves, creer-utilisateur and gerer-identifiant (nov3).
// No Deno / network calls in here, so the logic can be unit-tested with plain Node (see
// features/nov3/tests/famille.test.mjs).

/** "M" / "F" from what people type in a spreadsheet; null when empty or not understood. */
export function normalizeGender(value: unknown): "M" | "F" | null {
  if (value == null) return null;
  const v = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!v) return null;
  if (["m", "h", "g", "masculin", "homme", "garcon", "male"].includes(v)) return "M";
  if (["f", "feminin", "femme", "fille", "female"].includes(v)) return "F";
  return null;
}

/** ISO date (yyyy-mm-dd) from "yyyy-mm-dd", "dd/mm/yyyy", "dd-mm-yyyy" or "dd.mm.yyyy"; null when empty or invalid. */
export function normalizeDob(value: unknown): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(v);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Same rule as the database (ef_set_student_identity): age between 3 and 35. */
export function dobIsPlausible(iso: string, today: Date = new Date()): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const earliest = new Date(Date.UTC(today.getUTCFullYear() - 35, today.getUTCMonth(), today.getUTCDate()));
  const latest = new Date(Date.UTC(today.getUTCFullYear() - 3, today.getUTCMonth(), today.getUTCDate()));
  const dob = new Date(Date.UTC(y, m - 1, d));
  return dob >= earliest && dob <= latest;
}

/** 32 random characters nobody ever sees: the login of a family-managed pupil is locked anyway. */
export function lockedPassword(length = 32): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?-+";
  const arr = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

/** ~100 years: Supabase Auth "ban_duration" for a pupil who must never log in. */
export const LOCKED_BAN_DURATION = "876000h";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Parent phone: at least 8 digits (the database matches on the last 8). */
export function phoneIsUsable(value: string | null | undefined): boolean {
  return digitsOnly(String(value ?? "")).length >= 8;
}
