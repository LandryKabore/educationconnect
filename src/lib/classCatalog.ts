/** Catalogue de classes courantes (système scolaire francophone / Burkina Faso). */

export type CatalogClass = {
  /** Stable id for selection (not a DB id) */
  id: string;
  name: string;
  gradeLevel: string;
  category: string;
};

export const CLASS_CATEGORIES = [
  "Primaire",
  "Collège",
  "Lycée",
  "Technique",
] as const;

function sections(
  category: string,
  gradeLevel: string,
  namePrefix: string,
  letters: string[],
): CatalogClass[] {
  return letters.map((letter) => ({
    id: `${category}-${namePrefix}-${letter}`.toLowerCase().replace(/\s+/g, "-"),
    name: `${namePrefix} ${letter}`,
    gradeLevel,
    category,
  }));
}

export const CLASS_CATALOG: CatalogClass[] = [
  // Primaire — parallel groups A/B/C (each has its own emploi du temps)
  ...sections("Primaire", "CP1", "CP1", ["A", "B", "C"]),
  ...sections("Primaire", "CP2", "CP2", ["A", "B", "C"]),
  ...sections("Primaire", "CE1", "CE1", ["A", "B", "C"]),
  ...sections("Primaire", "CE2", "CE2", ["A", "B", "C"]),
  ...sections("Primaire", "CM1", "CM1", ["A", "B", "C"]),
  ...sections("Primaire", "CM2", "CM2", ["A", "B", "C"]),

  // Collège — common A/B/C groups
  ...sections("Collège", "6ème", "6ème", ["A", "B", "C"]),
  ...sections("Collège", "5ème", "5ème", ["A", "B", "C"]),
  ...sections("Collège", "4ème", "4ème", ["A", "B", "C"]),
  ...sections("Collège", "3ème", "3ème", ["A", "B", "C"]),

  // Lycée général
  ...sections("Lycée", "Seconde", "Seconde", ["A", "C", "D"]),
  ...sections("Lycée", "Première", "Première", ["A", "C", "D"]),
  ...sections("Lycée", "Terminale", "Terminale", ["A", "C", "D"]),

  // Technique / pro (common labels)
  { id: "tech-seconde-g1", name: "Seconde G1", gradeLevel: "Seconde", category: "Technique" },
  { id: "tech-seconde-g2", name: "Seconde G2", gradeLevel: "Seconde", category: "Technique" },
  { id: "tech-1ere-g1", name: "Première G1", gradeLevel: "Première", category: "Technique" },
  { id: "tech-1ere-g2", name: "Première G2", gradeLevel: "Première", category: "Technique" },
  { id: "tech-tle-g1", name: "Terminale G1", gradeLevel: "Terminale", category: "Technique" },
  { id: "tech-tle-g2", name: "Terminale G2", gradeLevel: "Terminale", category: "Technique" },
];

export function normalizeClassName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** School progression: CP → … → CM → 6ème → … → 3ème → Seconde → Première → Terminale */
const GRADE_PROGRESSION = [
  "cp1",
  "cp2",
  "ce1",
  "ce2",
  "cm1",
  "cm2",
  "6eme",
  "5eme",
  "4eme",
  "3eme",
  "seconde",
  "premiere",
  "terminale",
] as const;

function compactKey(text: string): string {
  return normalizeClassName(text).replace(/\s+/g, "");
}

function gradeRank(c: { name: string; grade_level?: string | null }): number {
  const keys = [c.grade_level, c.name]
    .filter(Boolean)
    .map((t) => compactKey(String(t)));

  for (const key of keys) {
    for (let i = 0; i < GRADE_PROGRESSION.length; i++) {
      const g = GRADE_PROGRESSION[i];
      if (key === g || key.startsWith(g)) return i;
    }
  }
  return GRADE_PROGRESSION.length + 1;
}

export function compareClassesByProgression(
  a: { name: string; grade_level?: string | null },
  b: { name: string; grade_level?: string | null },
): number {
  const ra = gradeRank(a);
  const rb = gradeRank(b);
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" });
}

export function sortClassesByProgression<
  T extends { name: string; grade_level?: string | null },
>(classes: T[]): T[] {
  return [...classes].sort(compareClassesByProgression);
}
