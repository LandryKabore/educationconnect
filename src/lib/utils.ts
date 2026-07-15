import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || "Utilisateur";
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
