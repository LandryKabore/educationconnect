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
    paths: [/^\/emplois-du-temps/, /^\/mon-emploi-du-temps/, new RegExp(`^${child}/emploi-du-temps`)],
  },
  {
    key: "notes",
    name: "Notes",
    description: "Évaluations, saisie des notes et moyennes par matière.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [/^\/classes\/[^/]+\/notes/, /^\/mes-notes/, new RegExp(`^${child}/notes`)],
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
    paths: [/^\/compositions-ecole/, /^\/mes-compositions/, new RegExp(`^${child}/compositions`)],
  },
  {
    key: "bulletins",
    name: "Bulletins",
    description: "Bulletins de chaque Trimestre : moyenne, rang, appréciation, PDF.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: ["notes"],
    paths: [/^\/bulletins/, /^\/mon-bulletin/, new RegExp(`^${child}/bulletin`)],
  },
  {
    key: "cahier_textes",
    name: "Cahier de textes",
    description: "Contenu des cours et avancement des programmes.",
    category: "pedagogie",
    available: true,
    defaultEnabled: true,
    requires: [],
    paths: [/^\/cahier-ecole/, /^\/cahier-de-textes/, /^\/mon-cahier/, new RegExp(`^${child}/cahier`)],
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
    description: "Le secrétariat saisit à la place d'un enseignant sans connexion.",
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
export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
}
