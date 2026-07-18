/** Catalogue de matières courantes (système scolaire francophone / Burkina Faso). */

export type CatalogSubject = {
  name: string;
  code: string;
  category: string;
};

export const SUBJECT_CATEGORIES = [
  "Primaire",
  "Langues (collège / lycée)",
  "Sciences (collège / lycée)",
  "Sciences humaines (collège / lycée)",
  "Arts & sport",
  "Techniques & options",
] as const;

export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

export const SUBJECT_CATALOG: CatalogSubject[] = [
  // Primaire — curricula Burkina (champs disciplinaires)
  { name: "Français", code: "FR", category: "Primaire" },
  { name: "Calcul", code: "CAL", category: "Primaire" },
  { name: "Anglais", code: "ANG", category: "Primaire" },
  { name: "Exercices d’observation", code: "OBS", category: "Primaire" },
  { name: "Histoire", code: "HIST", category: "Primaire" },
  { name: "Géographie", code: "GEO", category: "Primaire" },
  { name: "Éducation civique et morale", code: "ECM", category: "Primaire" },
  {
    name: "Activités physiques et éducatives",
    code: "APE",
    category: "Primaire",
  },
  { name: "Dessin", code: "DESS", category: "Primaire" },
  { name: "Chant", code: "CHANT", category: "Primaire" },
  {
    name: "Activités pratiques et productives",
    code: "APP",
    category: "Primaire",
  },
  {
    name: "Technologies de l’information et de la communication",
    code: "TIC",
    category: "Primaire",
  },
  { name: "Langue nationale", code: "LNAT", category: "Primaire" },
  { name: "Lecture", code: "LEC", category: "Primaire" },
  { name: "Écriture", code: "ECR", category: "Primaire" },
  { name: "Expression orale", code: "EO", category: "Primaire" },
  { name: "Éveil scientifique", code: "EVEIL", category: "Primaire" },

  // Langues — collège / lycée
  { name: "Français", code: "FR", category: "Langues (collège / lycée)" },
  { name: "Anglais", code: "ANG", category: "Langues (collège / lycée)" },
  { name: "Allemand", code: "ALL", category: "Langues (collège / lycée)" },
  { name: "Espagnol", code: "ESP", category: "Langues (collège / lycée)" },
  { name: "Arabe", code: "ARA", category: "Langues (collège / lycée)" },
  { name: "Latin", code: "LAT", category: "Langues (collège / lycée)" },
  { name: "Moore", code: "MOO", category: "Langues (collège / lycée)" },
  { name: "Dioula", code: "DIO", category: "Langues (collège / lycée)" },

  // Sciences
  {
    name: "Mathématiques",
    code: "MATH",
    category: "Sciences (collège / lycée)",
  },
  {
    name: "Physique-Chimie",
    code: "PC",
    category: "Sciences (collège / lycée)",
  },
  {
    name: "Sciences de la Vie et de la Terre",
    code: "SVT",
    category: "Sciences (collège / lycée)",
  },
  {
    name: "Sciences Physiques",
    code: "SP",
    category: "Sciences (collège / lycée)",
  },
  {
    name: "Informatique",
    code: "INFO",
    category: "Sciences (collège / lycée)",
  },
  {
    name: "Technologie",
    code: "TECH",
    category: "Sciences (collège / lycée)",
  },

  // Sciences humaines
  {
    name: "Histoire-Géographie",
    code: "HG",
    category: "Sciences humaines (collège / lycée)",
  },
  {
    name: "Philosophie",
    code: "PHILO",
    category: "Sciences humaines (collège / lycée)",
  },
  {
    name: "Éducation civique et morale",
    code: "ECM",
    category: "Sciences humaines (collège / lycée)",
  },
  {
    name: "Éducation à la citoyenneté",
    code: "EC",
    category: "Sciences humaines (collège / lycée)",
  },
  {
    name: "Économie",
    code: "ECO",
    category: "Sciences humaines (collège / lycée)",
  },
  {
    name: "Sciences économiques et sociales",
    code: "SES",
    category: "Sciences humaines (collège / lycée)",
  },

  // Arts & sport (souvent partagés)
  { name: "Éducation Physique et Sportive", code: "EPS", category: "Arts & sport" },
  { name: "Arts plastiques", code: "ART", category: "Arts & sport" },
  { name: "Musique", code: "MUS", category: "Arts & sport" },
  { name: "Théâtre", code: "THE", category: "Arts & sport" },

  // Techniques & options
  { name: "Comptabilité", code: "COMPTA", category: "Techniques & options" },
  { name: "Gestion", code: "GEST", category: "Techniques & options" },
  { name: "Secrétariat", code: "SEC", category: "Techniques & options" },
  { name: "Commerce", code: "COM", category: "Techniques & options" },
  { name: "Électrotechnique", code: "ELEC", category: "Techniques & options" },
  { name: "Mécanique", code: "MEC", category: "Techniques & options" },
  { name: "Dessin technique", code: "DT", category: "Techniques & options" },
  { name: "Agriculture", code: "AGRI", category: "Techniques & options" },
  { name: "Conduite accompagnée", code: "COND", category: "Techniques & options" },
];

/** Normalize for duplicate detection (accents kept, case/spacing ignored). */
export function normalizeSubjectKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function catalogKey(item: Pick<CatalogSubject, "name" | "code">): string {
  return `${normalizeSubjectKey(item.name)}|${item.code.toUpperCase()}`;
}

/**
 * Map a school subject to a catalog section.
 * Prefers Primaire when the subject exists there (shared codes like FR/ANG).
 */
export function resolveSubjectCategory(s: {
  name: string;
  code?: string | null;
}): string {
  const code = s.code?.trim().toUpperCase();
  if (code) {
    const primary = SUBJECT_CATALOG.find(
      (c) => c.code.toUpperCase() === code && c.category === "Primaire",
    );
    if (primary) return "Primaire";
    const hit = SUBJECT_CATALOG.find((c) => c.code.toUpperCase() === code);
    if (hit) return hit.category;
  }
  const key = normalizeSubjectKey(s.name);
  const primaryByName = SUBJECT_CATALOG.find(
    (c) => normalizeSubjectKey(c.name) === key && c.category === "Primaire",
  );
  if (primaryByName) return "Primaire";
  const byName = SUBJECT_CATALOG.find((c) => normalizeSubjectKey(c.name) === key);
  return byName?.category ?? "Autres";
}
