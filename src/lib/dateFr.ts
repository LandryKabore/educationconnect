/** French date helpers: display JJ/MM/AAAA, store ISO YYYY-MM-DD. */

export function isoToFr(iso: string): string {
  const v = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

/** Parse JJ/MM/AAAA (also accepts ., -) → ISO or null if invalid. */
export function frToIso(fr: string): string | null {
  const cleaned = fr.trim();
  if (!cleaned) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  const match = cleaned.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Digits-only typing helper → JJ/MM/AAAA as user types. */
export function formatFrDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
