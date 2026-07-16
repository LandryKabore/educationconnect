import type { GradeRow, Subject } from "@/lib/types";

export type GradeWithSubject = GradeRow & {
  subject?: Subject | null;
  matieres?: Subject | null;
};

export type SubjectAverage = {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  /** Average of notes for this subject, on /20 */
  averageOn20: number;
  gradeCount: number;
};

export type WeightedAverageResult = {
  subjects: SubjectAverage[];
  /** Σ (moyenne_matière × coef) / Σ coef */
  generalAverage: number | null;
  totalCoefficients: number;
  /** Σ (moyenne_matière × coef) */
  weightedSum: number;
};

export type AverageOptions = {
  /**
   * Per-class coefficients (subject_id → coef).
   * Takes priority over the default matieres.coefficient.
   */
  coefficientBySubject?: Record<string, number> | Map<string, number>;
};

function resolveSubject(g: GradeWithSubject): Subject | null {
  return g.subject ?? g.matieres ?? null;
}

function lookupCoef(
  subjectId: string,
  map?: AverageOptions["coefficientBySubject"],
): number | undefined {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(subjectId);
  const v = map[subjectId];
  return v !== undefined ? Number(v) : undefined;
}

/** Convert a raw score to /20. */
export function scoreOn20(score: number, maxScore: number): number {
  if (!maxScore || maxScore <= 0) return 0;
  return (score / maxScore) * 20;
}

/**
 * Moyenne générale pondérée :
 * Σ (note_matière × coef) / Σ coef
 * — only subjects where the student has at least one grade
 * — several notes in same subject → average first
 * — coef = programme de la classe si défini, sinon coef par défaut de la matière
 */
export function computeWeightedAverage(
  grades: GradeWithSubject[],
  options?: AverageOptions,
): WeightedAverageResult {
  const bySubject = new Map<
    string,
    { name: string; coefficient: number; scoresOn20: number[] }
  >();

  for (const g of grades) {
    const sub = resolveSubject(g);
    const subjectId = g.subject_id || sub?.id;
    if (!subjectId) continue;

    const classCoef = lookupCoef(subjectId, options?.coefficientBySubject);
    const defaultCoef =
      sub && Number(sub.coefficient) > 0 ? Number(sub.coefficient) : 1;
    const coefficient =
      classCoef !== undefined && classCoef > 0 ? classCoef : defaultCoef;

    const existing = bySubject.get(subjectId) ?? {
      name: sub?.name ?? "—",
      coefficient,
      scoresOn20: [],
    };
    existing.scoresOn20.push(scoreOn20(Number(g.score), Number(g.max_score)));
    if (sub?.name) existing.name = sub.name;
    existing.coefficient = coefficient;
    bySubject.set(subjectId, existing);
  }

  const subjects: SubjectAverage[] = [];
  let weightedSum = 0;
  let totalCoefficients = 0;

  for (const [subjectId, data] of bySubject) {
    const averageOn20 =
      data.scoresOn20.reduce((a, b) => a + b, 0) / data.scoresOn20.length;
    subjects.push({
      subjectId,
      subjectName: data.name,
      coefficient: data.coefficient,
      averageOn20,
      gradeCount: data.scoresOn20.length,
    });
    weightedSum += averageOn20 * data.coefficient;
    totalCoefficients += data.coefficient;
  }

  subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "fr"));

  return {
    subjects,
    generalAverage:
      totalCoefficients > 0 ? weightedSum / totalCoefficients : null,
    totalCoefficients,
    weightedSum,
  };
}

export function formatAverage(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

/** Build subject_id → coefficient map from programme_classe rows. */
export function programmeToCoefMap(
  rows: { subject_id: string; coefficient: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const c = Number(r.coefficient);
    if (r.subject_id && c > 0) out[r.subject_id] = c;
  }
  return out;
}
