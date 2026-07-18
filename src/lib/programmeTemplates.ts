import type { ClassSection, Subject } from "@/lib/types";
import {
  normalizeSubjectKey,
  SUBJECT_CATALOG,
} from "@/lib/subjectCatalog";
import { normalizeClassName } from "@/lib/classCatalog";

export type ProgrammeTemplateId =
  | "primaire"
  | "college"
  | "lycee-a"
  | "lycee-c"
  | "lycee-d"
  | "technique"
  | "custom";

export type TemplateSubjectSpec = {
  /** Prefer matching school matières by code */
  code: string;
  /** Fallback match by name */
  name: string;
  coefficient: number;
  /** Prefer primary catalog category when codes collide (FR, MATH…) */
  preferPrimary?: boolean;
};

export type ProgrammeTemplate = {
  id: ProgrammeTemplateId;
  label: string;
  description: string;
  /** Grade hints for suggesting classes */
  gradeHints: string[];
  subjects: TemplateSubjectSpec[];
};

const collegeCore: TemplateSubjectSpec[] = [
  { code: "FR", name: "Français", coefficient: 4 },
  { code: "ANG", name: "Anglais", coefficient: 3 },
  { code: "MATH", name: "Mathématiques", coefficient: 4 },
  { code: "PC", name: "Physique-Chimie", coefficient: 3 },
  { code: "SVT", name: "Sciences de la Vie et de la Terre", coefficient: 3 },
  { code: "HG", name: "Histoire-Géographie", coefficient: 3 },
  { code: "ECM", name: "Éducation civique et morale", coefficient: 1 },
  { code: "EPS", name: "Éducation Physique et Sportive", coefficient: 1 },
];

export const PROGRAMME_TEMPLATES: ProgrammeTemplate[] = [
  {
    id: "primaire",
    label: "Primaire (CP–CM)",
    description: "Curriculum primaire — langues, calcul, éveil, APE…",
    gradeHints: ["cp1", "cp2", "ce1", "ce2", "cm1", "cm2"],
    subjects: SUBJECT_CATALOG.filter((s) => s.category === "Primaire").map(
      (s) => ({
        code: s.code,
        name: s.name,
        coefficient: ["FR", "CAL", "LEC"].includes(s.code) ? 3 : 1,
        preferPrimary: true,
      }),
    ),
  },
  {
    id: "college",
    label: "Collège (6e–3e)",
    description: "Tronc commun collège avec coefficients usuels.",
    gradeHints: ["6eme", "5eme", "4eme", "3eme"],
    subjects: [
      ...collegeCore,
      { code: "INFO", name: "Informatique", coefficient: 1 },
      { code: "ART", name: "Arts plastiques", coefficient: 1 },
    ],
  },
  {
    id: "lycee-a",
    label: "Lycée — Série A",
    description: "Littéraire : français, langues, HG, philo…",
    gradeHints: ["seconde", "premiere", "terminale"],
    subjects: [
      { code: "FR", name: "Français", coefficient: 5 },
      { code: "ANG", name: "Anglais", coefficient: 4 },
      { code: "PHILO", name: "Philosophie", coefficient: 4 },
      { code: "HG", name: "Histoire-Géographie", coefficient: 4 },
      { code: "MATH", name: "Mathématiques", coefficient: 2 },
      { code: "SVT", name: "Sciences de la Vie et de la Terre", coefficient: 2 },
      { code: "EPS", name: "Éducation Physique et Sportive", coefficient: 1 },
      { code: "ECM", name: "Éducation civique et morale", coefficient: 1 },
    ],
  },
  {
    id: "lycee-c",
    label: "Lycée — Série C",
    description: "Scientifique : maths, physique-chimie…",
    gradeHints: ["seconde", "premiere", "terminale"],
    subjects: [
      { code: "MATH", name: "Mathématiques", coefficient: 5 },
      { code: "PC", name: "Physique-Chimie", coefficient: 5 },
      { code: "FR", name: "Français", coefficient: 3 },
      { code: "ANG", name: "Anglais", coefficient: 2 },
      { code: "HG", name: "Histoire-Géographie", coefficient: 2 },
      { code: "PHILO", name: "Philosophie", coefficient: 2 },
      { code: "SVT", name: "Sciences de la Vie et de la Terre", coefficient: 2 },
      { code: "EPS", name: "Éducation Physique et Sportive", coefficient: 1 },
    ],
  },
  {
    id: "lycee-d",
    label: "Lycée — Série D",
    description: "Sciences naturelles : SVT, PC, maths…",
    gradeHints: ["seconde", "premiere", "terminale"],
    subjects: [
      { code: "SVT", name: "Sciences de la Vie et de la Terre", coefficient: 5 },
      { code: "PC", name: "Physique-Chimie", coefficient: 4 },
      { code: "MATH", name: "Mathématiques", coefficient: 4 },
      { code: "FR", name: "Français", coefficient: 3 },
      { code: "ANG", name: "Anglais", coefficient: 2 },
      { code: "HG", name: "Histoire-Géographie", coefficient: 2 },
      { code: "PHILO", name: "Philosophie", coefficient: 2 },
      { code: "EPS", name: "Éducation Physique et Sportive", coefficient: 1 },
    ],
  },
  {
    id: "technique",
    label: "Technique / commercial",
    description: "Comptabilité, gestion, commerce, langues…",
    gradeHints: ["seconde", "premiere", "terminale", "g1", "g2"],
    subjects: [
      { code: "FR", name: "Français", coefficient: 3 },
      { code: "ANG", name: "Anglais", coefficient: 3 },
      { code: "MATH", name: "Mathématiques", coefficient: 3 },
      { code: "COMPTA", name: "Comptabilité", coefficient: 4 },
      { code: "GEST", name: "Gestion", coefficient: 4 },
      { code: "COM", name: "Commerce", coefficient: 3 },
      { code: "ECO", name: "Économie", coefficient: 3 },
      { code: "INFO", name: "Informatique", coefficient: 2 },
      { code: "EPS", name: "Éducation Physique et Sportive", coefficient: 1 },
    ],
  },
  {
    id: "custom",
    label: "Personnalisé",
    description: "Choisissez librement les matières du catalogue école.",
    gradeHints: [],
    subjects: [],
  },
];

function compact(text: string): string {
  return normalizeClassName(text).replace(/\s+/g, "");
}

function classKey(c: Pick<ClassSection, "name" | "grade_level">): string {
  return compact([c.grade_level, c.name].filter(Boolean).join(" "));
}

/** Suggest classes that typically use this template. */
export function classMatchesTemplate(
  c: Pick<ClassSection, "name" | "grade_level">,
  template: ProgrammeTemplate,
): boolean {
  if (template.id === "custom") return true;
  const key = classKey(c);
  const name = compact(c.name);

  if (template.id === "primaire") {
    return /^(cp|ce|cm)/.test(key) || /^(cp|ce|cm)/.test(name);
  }
  if (template.id === "college") {
    return /^(6|5|4|3)eme/.test(key) || /^(6|5|4|3)eme/.test(name);
  }
  if (template.id === "technique") {
    return (
      /\bg[12]\b/.test(name) ||
      name.includes("g1") ||
      name.includes("g2") ||
      name.includes("technique")
    );
  }
  if (template.id === "lycee-a") {
    if (/g[12]/.test(name)) return false;
    return (
      (key.includes("seconde") ||
        key.includes("premiere") ||
        key.includes("terminale")) &&
      (name.includes(" a") ||
        name.endsWith("a") ||
        /\ba\b/.test(normalizeClassName(c.name)))
    );
  }
  if (template.id === "lycee-c") {
    if (/g[12]/.test(name)) return false;
    return (
      (key.includes("seconde") ||
        key.includes("premiere") ||
        key.includes("terminale")) &&
      (name.includes(" c") ||
        name.endsWith("c") ||
        /\bc\b/.test(normalizeClassName(c.name)))
    );
  }
  if (template.id === "lycee-d") {
    if (/g[12]/.test(name)) return false;
    return (
      (key.includes("seconde") ||
        key.includes("premiere") ||
        key.includes("terminale")) &&
      (name.includes(" d") ||
        name.endsWith("d") ||
        /\bd\b/.test(normalizeClassName(c.name)))
    );
  }
  return template.gradeHints.some((h) => key.includes(h) || name.includes(h));
}

function findSchoolSubject(
  subjects: Subject[],
  spec: TemplateSubjectSpec,
): Subject | undefined {
  const code = spec.code.trim().toUpperCase();
  if (code) {
    const byCode = subjects.filter(
      (s) => (s.code ?? "").trim().toUpperCase() === code,
    );
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) {
      if (spec.preferPrimary) {
        const primary = byCode.find((s) => {
          const cat = SUBJECT_CATALOG.find(
            (c) =>
              c.code.toUpperCase() === code &&
              normalizeSubjectKey(c.name) === normalizeSubjectKey(s.name),
          );
          return cat?.category === "Primaire";
        });
        if (primary) return primary;
        // Prefer subject whose name matches primary catalog
        const catalogPrimary = SUBJECT_CATALOG.find(
          (c) => c.code.toUpperCase() === code && c.category === "Primaire",
        );
        if (catalogPrimary) {
          const hit = byCode.find(
            (s) =>
              normalizeSubjectKey(s.name) ===
              normalizeSubjectKey(catalogPrimary.name),
          );
          if (hit) return hit;
        }
      }
      const byName = byCode.find(
        (s) => normalizeSubjectKey(s.name) === normalizeSubjectKey(spec.name),
      );
      if (byName) return byName;
      return byCode[0];
    }
  }
  return subjects.find(
    (s) => normalizeSubjectKey(s.name) === normalizeSubjectKey(spec.name),
  );
}

export type MatchedTemplateSubject = {
  subject: Subject;
  coefficient: number;
};

/** Resolve template specs against the school's matière catalogue. */
export function matchTemplateToSchoolSubjects(
  subjects: Subject[],
  template: ProgrammeTemplate,
): { matched: MatchedTemplateSubject[]; missing: TemplateSubjectSpec[] } {
  if (template.id === "custom") {
    return { matched: [], missing: [] };
  }
  const matched: MatchedTemplateSubject[] = [];
  const missing: TemplateSubjectSpec[] = [];
  const used = new Set<string>();

  for (const spec of template.subjects) {
    const subject = findSchoolSubject(subjects, spec);
    if (!subject || used.has(subject.id)) {
      missing.push(spec);
      continue;
    }
    used.add(subject.id);
    matched.push({
      subject,
      coefficient: spec.coefficient,
    });
  }
  return { matched, missing };
}

export function getTemplate(id: ProgrammeTemplateId): ProgrammeTemplate {
  return (
    PROGRAMME_TEMPLATES.find((t) => t.id === id) ?? PROGRAMME_TEMPLATES[0]
  );
}
