/**
 * Device-local "remember my identifier" convenience — NOT a credential vault.
 *
 * SECURITY NOTE: this deliberately never stores the password. Earlier
 * versions kept a base64-"obfuscated" password in localStorage, which is
 * trivially reversible (anyone with DevTools/localStorage access on a
 * shared school computer could read every saved account in clear text).
 * Browser localStorage has no OS-level encryption, so no client-side
 * encoding here would provide real confidentiality. Only the login
 * identifier (username/email) is remembered to speed up re-entry; the
 * password must always be typed.
 */

const STORAGE_KEY = "edufaso-saved-logins";

export type SavedLogin = {
  id: string;
  /** Display / login identifier (username or email). */
  identifiant: string;
  savedAt: string;
};

function readAll(): SavedLogin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SavedLogin =>
        !!x &&
        typeof x === "object" &&
        typeof (x as SavedLogin).identifiant === "string" &&
        (x as SavedLogin).identifiant.trim().length > 0,
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

export function saveIdentifiant(identifiant: string): SavedLogin {
  const trimmed = identifiant.trim();
  const existing = findSavedLogin(trimmed);
  const entry: SavedLogin = {
    id: existing?.id ?? crypto.randomUUID(),
    identifiant: trimmed,
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
