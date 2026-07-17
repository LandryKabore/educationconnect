/** Rules for user-chosen passwords (first login / change). */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId =
  | "minLength"
  | "uppercase"
  | "number"
  | "special";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  test: (password: string) => boolean;
};

/** Special = non-alphanumeric (punctuation / symbols). */
const SPECIAL_RE = /[^A-Za-z0-9]/;
const UPPER_RE = /[A-Z]/;
const NUMBER_RE = /[0-9]/;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "minLength",
    label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "Au moins une majuscule (A–Z)",
    test: (p) => UPPER_RE.test(p),
  },
  {
    id: "number",
    label: "Au moins un chiffre (0–9)",
    test: (p) => NUMBER_RE.test(p),
  },
  {
    id: "special",
    label: "Au moins un caractère spécial (!@#$…)",
    test: (p) => SPECIAL_RE.test(p),
  },
];

export function getFailedPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((r) => !r.test(password));
}

export function isPasswordStrong(password: string): boolean {
  return getFailedPasswordRules(password).length === 0;
}

export function passwordStrengthError(password: string): string | null {
  const failed = getFailedPasswordRules(password);
  if (failed.length === 0) return null;
  return `Mot de passe trop faible : ${failed.map((f) => f.label.toLowerCase()).join(", ")}.`;
}
