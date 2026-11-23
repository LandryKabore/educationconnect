/*
 * School modules: each feature of the app is a module the super admin turns on or
 * off for each school (table ecole_modules). This file mirrors the database
 * catalogue (migration 20261116100000_school_modules.sql) and maps every page of
 * the app to the module it belongs to, so menus and pages follow one switch.
 *
 * Pages that belong to no module (home, profile, classes, élèves, enseignants,
 * structure…) are the core of the app and always stay on.
 */

export type ModuleKey =
  | "emplois_du_temps"
  | "notes"
  | "devoirs"
  | "compositions"
  | "bulletins"
  | "cahier_textes"
  | "presences"
  | "saisie_secretariat"
  | "messages"
  | "espace_classe"
  | "statistiques"
  | "frais_scolarite"
  | "discipline"
  | "sms"
  | "certificats"
  | "cantine"
  | "bibliotheque"
  | "transport";

export type ModuleCategory =
  | "pedagogie"
  | "vie_scolaire"
  | "communication"
  | "administration"
  | "services";

export interface ModuleDef {
  key: ModuleKey;
  name: string;
  description: string;
  category: ModuleCategory;
  /** false = on the roadmap, shown as "Bientôt", cannot be turned on yet */
  available: boolean;
  /** state of a school that has no row for this module */
  defaultEnabled: boolean;
  /** modules that must be on for this one to work */
  requires: ModuleKey[];
  /** pages of the app that belong to this module */
  paths: RegExp[];
}

const child = "/enfants/[^/]+";

export const MODULES: ModuleDef[] = [
  {
    key: "emplois_du_temps",
    name: "Emplois du temps",
    description: "Emploi du temps des classes, des enseignants et des élèves.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [
      /^\/emplois-du-temps/,
      /^\/mon-emploi-du-temps/,
      new RegExp(`^${child}/emploi-du-temps`),
    ],
  },
  {
    key: "notes",
    name: "Notes",
    description: "Évaluations, saisie des notes et moyennes par matière.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [
      /^\/classes\/[^/]+\/notes/,
      /^\/mes-notes/,
      new RegExp(`^${child}/notes`),
    ],
  },
  {
    key: "devoirs",
    name: "Devoirs et examens",
    description: "Exercices de maison, interrogations et examens programmés.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [
      /^\/devoirs-ecole/,
      /^\/examens-ecole/,
      /^\/devoirs$/,
      /^\/examens$/,
      /^\/exercices-maison/,
      /^\/mes-devoirs/,
      /^\/mes-exercices/,
      /^\/mes-examens/,
      new RegExp(`^${child}/(devoirs|exercices)`),
    ],
  },
  {
    key: "compositions",
    name: "Compositions",
    description: "Sessions de compositions organisées par l'administration.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: ["notes"],
    paths: [
      /^\/compositions-ecole/,
      /^\/mes-compositions/,
      new RegExp(`^${child}/compositions`),
    ],
  },
  {
    key: "bulletins",
    name: "Bulletins",
    description:
      "Bulletins de chaque Trimestre : moyenne, rang, appréciation, PDF.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: ["notes"],
    paths: [
      /^\/bulletins/,
      /^\/mon-bulletin/,
      new RegExp(`^${child}/bulletin`),
    ],
  },
  {
    key: "cahier_textes",
    name: "Cahier de textes",
    description: "Contenu des cours et avancement des programmes.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [
      /^\/cahier-ecole/,
      /^\/cahier-de-textes/,
      /^\/mon-cahier/,
      new RegExp(`^${child}/cahier`),
    ],
  },
  {
    key: "presences",
    name: "Présences",
    description: "Appel à chaque cours, absences, retards et justifications.",
    category: "vie_scolaire",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [
      /^\/presences-ecole/,
      /^\/presences$/,
      /^\/classes\/[^/]+\/presences/,
      /^\/mes-presences/,
      new RegExp(`^${child}/presences`),
    ],
  },
  {
    key: "saisie_secretariat",
    name: "Saisie par le secrétariat",
    description:
      "Le secrétariat saisit à la place d'un enseignant sans connexion.",
    category: "vie_scolaire",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [/^\/saisie-enseignant/],
  },
  {
    key: "messages",
    name: "Messages et annonces",
    description: "Messagerie interne et annonces de l'école.",
    category: "communication",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [/^\/messages/, /^\/annonces/],
  },
  {
    key: "espace_classe",
    name: "Espace classe",
    description: "Les élèves d'une même classe (secondaire) s'entraident : questions, fiches de révision, groupes de travail.",
    category: "communication",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [/^\/espace-classe/],
  },
  {
    key: "statistiques",
    name: "Statistiques",
    description: "Résultats et présences par classe et par matière.",
    category: "administration",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [/^\/statistiques/],
  },
  // ---- roadmap: listed for the super admin, not switchable yet
  {
    key: "discipline",
    name: "Discipline",
    description: "Avertissements, sanctions et conduite.",
    category: "vie_scolaire",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
  {
    key: "sms",
    name: "Alertes SMS",
    description: "Absences et notes envoyées aux parents par SMS.",
    category: "communication",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
  {
    key: "frais_scolarite",
    name: "Frais de scolarité",
    description: "Échéances, paiements, reçus et relances, paiement mobile.",
    category: "administration",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
  {
    key: "certificats",
    name: "Certificats",
    description: "Certificats de scolarité et attestations.",
    category: "administration",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
  {
    key: "cantine",
    name: "Cantine",
    description: "Inscriptions et suivi des repas.",
    category: "services",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
  {
    key: "bibliotheque",
    name: "Bibliothèque",
    description: "Prêts et retours de livres.",
    category: "services",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
  {
    key: "transport",
    name: "Transport",
    description: "Circuits et inscriptions au transport scolaire.",
    category: "services",
    available: false,
    defaultEnabled: false,
    requires: [],
    paths: [],
  },
];

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  pedagogie: "Pédagogie",
  vie_scolaire: "Vie scolaire",
  communication: "Communication",
  administration: "Administration",
  services: "Services",
};

export const MODULE_CATEGORY_ORDER: ModuleCategory[] = [
  "pedagogie",
  "vie_scolaire",
  "communication",
  "administration",
  "services",
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function moduleDef(key: ModuleKey): ModuleDef | undefined {
  return BY_KEY.get(key);
}

/** The module a page belongs to, or null for core pages that are always on. */
export function moduleForPath(pathname: string): ModuleDef | null {
  for (const m of MODULES) {
    if (m.paths.some((re) => re.test(pathname))) return m;
  }
  return null;
}

/** A school's saved row for one module (table ecole_modules). */
export interface SchoolModuleRow {
  school_id: string;
  module_key: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at?: string;
}

/** Final on/off state of every module for a school, saved rows over catalogue defaults. */
export function resolveModuleStates(
  rows: SchoolModuleRow[] | undefined,
): Record<ModuleKey, boolean> {
  const saved = new Map((rows ?? []).map((r) => [r.module_key, r.enabled]));
  const out = {} as Record<ModuleKey, boolean>;
  for (const m of MODULES) {
    out[m.key] = m.available && (saved.get(m.key) ?? m.defaultEnabled);
  }
  return out;
}

/** Modules that need `key` (turning `key` off turns these off first). */
export function dependentsOf(key: ModuleKey): ModuleDef[] {
  return MODULES.filter((m) => m.requires.includes(key));
}

/** True when the error means the modules tables are not in the database yet. */
export function isMissingTableError(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
}

// ============================================================ role access ===
// Mirrors modules_catalogue.role_access (migration 20261116110000_role_permissions.sql).

export type AccessLevel = "aucun" | "consulter" | "modifier";
export type SchoolRole = "school_admin" | "teacher" | "student" | "parent";

export const SCHOOL_ROLES: SchoolRole[] = [
  "school_admin",
  "teacher",
  "student",
  "parent",
];

export const SCHOOL_ROLE_LABELS: Record<SchoolRole, string> = {
  school_admin: "Administration",
  teacher: "Enseignants",
  student: "Élèves",
  parent: "Parents",
};

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  aucun: "Aucun accès",
  consulter: "Consulter",
  modifier: "Modifier",
};

const RANK: Record<AccessLevel, number> = {
  aucun: 0,
  consulter: 1,
  modifier: 2,
};

export function levelsUpTo(max: AccessLevel): AccessLevel[] {
  return (["aucun", "consulter", "modifier"] as AccessLevel[]).filter(
    (l) => RANK[l] <= RANK[max],
  );
}

type RoleAccess = Record<
  SchoolRole,
  { max: AccessLevel; default: AccessLevel }
>;
type Pair = [max: AccessLevel, start: AccessLevel];

function access(
  admin: Pair,
  teacher: Pair,
  student: Pair,
  parent: Pair,
): RoleAccess {
  const one = ([max, start]: Pair) => ({ max, default: start });
  return {
    school_admin: one(admin),
    teacher: one(teacher),
    student: one(student),
    parent: one(parent),
  };
}

const M: Pair = ["modifier", "modifier"];
const C: Pair = ["consulter", "consulter"];
const N: Pair = ["aucun", "aucun"];

/** For each module and school role: highest level the app supports, and the starting level. */
export const ROLE_ACCESS: Partial<Record<ModuleKey, RoleAccess>> = {
  emplois_du_temps: access(M, C, C, C),
  notes: access(M, M, C, C),
  devoirs: access(M, M, C, C),
  compositions: access(M, M, C, C),
  bulletins: access(M, N, C, C),
  cahier_textes: access(C, M, C, C),
  presences: access(M, M, C, C),
  saisie_secretariat: access(M, N, N, N),
  messages: access(M, M, M, M),
  statistiques: access(C, N, N, N),
};

export function isSchoolRole(
  role: string | null | undefined,
): role is SchoolRole {
  return !!role && (SCHOOL_ROLES as string[]).includes(role);
}

/** A school's saved row for one module and role (table ecole_role_permissions). */
export interface RolePermissionRow {
  school_id: string;
  module_key: string;
  role: string;
  level: AccessLevel;
}

/** Level in force for one role: module off = aucun, saved row over default, never above max. */
export function resolveLevel(
  key: ModuleKey,
  role: SchoolRole,
  moduleOn: boolean,
  rows: RolePermissionRow[] | undefined,
): AccessLevel {
  if (!moduleOn) return "aucun";
  const acc = ROLE_ACCESS[key]?.[role];
  if (!acc) return "aucun";
  const saved = rows?.find(
    (r) => r.module_key === key && r.role === role,
  )?.level;
  const level = saved ?? acc.default;
  return RANK[level] > RANK[acc.max] ? acc.max : level;
}
