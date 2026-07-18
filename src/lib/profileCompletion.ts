import type { AppRole, Profile } from "@/lib/types";

export type ProfileFieldKey =
  | "first_name"
  | "last_name"
  | "phone"
  | "date_of_birth"
  | "gender"
  | "address";

export type ProfileFieldDef = {
  key: ProfileFieldKey;
  label: string;
  required: boolean;
  type: "text" | "tel" | "date" | "gender";
};

/** Fields expected after first login, by role. */
export const PROFILE_FIELDS_BY_ROLE: Partial<
  Record<AppRole, ProfileFieldDef[]>
> = {
  teacher: [
    { key: "first_name", label: "Prénom", required: true, type: "text" },
    { key: "last_name", label: "Nom", required: true, type: "text" },
    { key: "phone", label: "Téléphone", required: true, type: "tel" },
    { key: "gender", label: "Sexe", required: true, type: "gender" },
  ],
  student: [
    { key: "first_name", label: "Prénom", required: true, type: "text" },
    { key: "last_name", label: "Nom", required: true, type: "text" },
    {
      key: "date_of_birth",
      label: "Date de naissance",
      required: true,
      type: "date",
    },
    { key: "gender", label: "Sexe", required: true, type: "gender" },
    { key: "phone", label: "Téléphone", required: true, type: "tel" },
  ],
  parent: [
    { key: "first_name", label: "Prénom", required: true, type: "text" },
    { key: "last_name", label: "Nom", required: true, type: "text" },
    { key: "phone", label: "Téléphone", required: true, type: "tel" },
    { key: "gender", label: "Sexe", required: false, type: "gender" },
  ],
};

const ROLES_NEEDING_COMPLETION: AppRole[] = ["teacher", "student", "parent"];

function isBlank(value: string | null | undefined) {
  return !value || !String(value).trim();
}

export function getProfileFieldValue(
  profile: Profile,
  key: ProfileFieldKey,
): string {
  const raw = profile[key];
  return raw == null ? "" : String(raw);
}

export function getMissingProfileFields(
  profile: Profile | null | undefined,
  role: AppRole | null | undefined,
): ProfileFieldDef[] {
  if (!profile || !role) return [];
  if (!ROLES_NEEDING_COMPLETION.includes(role)) return [];
  const defs = PROFILE_FIELDS_BY_ROLE[role] ?? [];
  return defs.filter((f) => f.required && isBlank(getProfileFieldValue(profile, f.key)));
}

/** Required fields missing — user should complete profile before using the app. */
export function needsProfileCompletion(
  profile: Profile | null | undefined,
  role: AppRole | null | undefined,
): boolean {
  return getMissingProfileFields(profile, role).length > 0;
}

/** Required + optional empty fields to show on the completion form. */
export function getProfileFieldsToPrompt(
  profile: Profile | null | undefined,
  role: AppRole | null | undefined,
): ProfileFieldDef[] {
  if (!profile || !role) return [];
  if (!ROLES_NEEDING_COMPLETION.includes(role)) return [];
  const defs = PROFILE_FIELDS_BY_ROLE[role] ?? [];
  return defs.filter((f) => isBlank(getProfileFieldValue(profile, f.key)));
}

export const GENDER_OPTIONS = [
  { value: "M", label: "Masculin" },
  { value: "F", label: "Féminin" },
  { value: "other", label: "Autre" },
] as const;
