import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || "Utilisateur";
}

/** Real display name only — empty when profile is still loading or incomplete. */
export function personName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim();
}

/**
 * Normalize a PostgREST embed: object, single-element array, or null.
 * Bare `profils(*)` joins sometimes arrive as arrays — reading `.first_name`
 * on those yields undefined and causes name flashes ("Élève" / "Utilisateur").
 */
export function joinProfile<
  T extends { first_name?: string | null; last_name?: string | null } = {
    first_name: string | null;
    last_name: string | null;
  },
>(raw: unknown): T | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === "object" ? (first as T) : null;
  }
  if (typeof raw === "object") return raw as T;
  return null;
}

/** Identifiant local → email technique Auth */
export function toAuthEmail(identifiant: string) {
  const value = identifiant.trim().toLowerCase();
  if (value.includes("@")) return value;
  return `${value}@edufaso.local`;
}

export function fromAuthEmail(email?: string | null) {
  if (!email) return "";
  return email.endsWith("@edufaso.local")
    ? email.replace("@edufaso.local", "")
    : email;
}

/** Case/accent-insensitive match for people lists (name, class, username, …). */
export function matchesSearch(
  query: string,
  ...parts: (string | null | undefined)[]
): boolean {
  const q = query
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (!q) return true;
  const hay = parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}
