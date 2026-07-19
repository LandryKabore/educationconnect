/** Device-local saved logins for quick re-entry (not a vault — convenience only). */

const STORAGE_KEY = "edufaso-saved-logins";

export type SavedLogin = {
  id: string;
  /** Display / login identifier (username or email). */
  identifiant: string;
  /** Obfuscated password; empty if user chose identifier only. */
  passwordEnc: string;
  savedAt: string;
};

function encodePassword(password: string): string {
  const bytes = new TextEncoder().encode(password);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodePassword(enc: string): string {
  if (!enc) return "";
  try {
    const binary = atob(enc);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function readAll(): SavedLogin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLogin[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) => x && typeof x.identifiant === "string" && x.identifiant.trim(),
    );
  } catch {
    return [];
  }
}

function writeAll(items: SavedLogin[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
}

export function listSavedLogins(): SavedLogin[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function findSavedLogin(identifiant: string): SavedLogin | null {
  const key = identifiant.trim().toLowerCase();
  return (
    readAll().find((x) => x.identifiant.trim().toLowerCase() === key) ?? null
  );
}

export function saveLogin(identifiant: string, password: string): SavedLogin {
  const trimmed = identifiant.trim();
  const existing = findSavedLogin(trimmed);
  const entry: SavedLogin = {
    id: existing?.id ?? crypto.randomUUID(),
    identifiant: trimmed,
    passwordEnc: encodePassword(password),
    savedAt: new Date().toISOString(),
  };
  const others = readAll().filter(
    (x) => x.identifiant.trim().toLowerCase() !== trimmed.toLowerCase(),
  );
  writeAll([entry, ...others]);
  return entry;
}

export function removeSavedLogin(id: string) {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function getSavedPassword(entry: SavedLogin): string {
  return decodePassword(entry.passwordEnc ?? "");
}
