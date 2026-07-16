/** Catalogue de matières courantes (système scolaire francophone / Burkina Faso). */

export type CatalogSubject = {
  name: string;
  code: string;
  category: string;
};

export const SUBJECT_CATEGORIES = [
  "Langues",
  "Sciences",
  "Sciences humaines",
  "Arts & sport",
  "Techniques & options",
  "Primaire",
] as const;

export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

export const SUBJECT_CATALOG: CatalogSubject[] = [
  // Langues
  { name: "Français", code: "FR", category: "Langues" },
  { name: "Anglais", code: "ANG", category: "Langues" },
  { name: "Allemand", code: "ALL", category: "Langues" },
  { name: "Espagnol", code: "ESP", category: "Langues" },
  { name: "Arabe", code: "ARA", category: "Langues" },
  { name: "Latin", code: "LAT", category: "Langues" },
  { name: "Moore", code: "MOO", category: "Langues" },
  { name: "Dioula", code: "DIO", category: "Langues" },

  // Sciences
  { name: "Mathématiques", code: "MATH", category: "Sciences" },
  { name: "Physique-Chimie", code: "PC", category: "Sciences" },
  { name: "Sciences de la Vie et de la Terre", code: "SVT", category: "Sciences" },
  { name: "Sciences Physiques", code: "SP", category: "Sciences" },
  { name: "Informatique", code: "INFO", category: "Sciences" },
  { name: "Technologie", code: "TECH", category: "Sciences" },

  // Sciences humaines
  { name: "Histoire-Géographie", code: "HG", category: "Sciences humaines" },
  { name: "Philosophie", code: "PHILO", category: "Sciences humaines" },
  { name: "Éducation civique et morale", code: "ECM", category: "Sciences humaines" },
  { name: "Éducation à la citoyenneté", code: "EC", category: "Sciences humaines" },
  { name: "Économie", code: "ECO", category: "Sciences humaines" },
  { name: "Sciences économiques et sociales", code: "SES", category: "Sciences humaines" },

  // Arts & sport
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

  // Primaire
  { name: "Lecture", code: "LEC", category: "Primaire" },
  { name: "Écriture", code: "ECR", category: "Primaire" },
  { name: "Calcul", code: "CAL", category: "Primaire" },
  { name: "Éveil scientifique", code: "EVEIL", category: "Primaire" },
  { name: "Expression orale", code: "EO", category: "Primaire" },
  { name: "Activités pratiques", code: "AP", category: "Primaire" },
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
