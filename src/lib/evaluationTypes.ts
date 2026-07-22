import type { EvaluationType } from "@/lib/types";

export const EVALUATION_TYPES: EvaluationType[] = [
  "interrogation",
  "devoir",
  "composition",
  "examen",
];

/** Types teachers create themselves — compositions & exams are admin-scheduled. */
export const TEACHER_EVALUATION_TYPES: EvaluationType[] = [
  "interrogation",
  "devoir",
];

const LABELS: Record<EvaluationType, string> = {
  interrogation: "Interrogation",
  /** Travaux à la maison (type DB `devoir`). */
  devoir: "Exercice de maison",
  composition: "Composition",
  /** Devoir surveillé / contrôle (type DB `examen`) — called « devoir » locally. */
  examen: "Devoir",
};

const SHORT: Record<EvaluationType, string> = {
  interrogation: "Interro",
  devoir: "Exercice",
  composition: "Compo",
  examen: "Devoir",
};

export function isEvaluationType(value: string): value is EvaluationType {
  return (EVALUATION_TYPES as string[]).includes(value);
}

export function evaluationTypeLabel(type: EvaluationType): string {
  return LABELS[type] ?? type;
}

export function evaluationTypeShort(type: EvaluationType): string {
  return SHORT[type] ?? type;
}

/** Tailwind tone for a small badge per type. */
export function evaluationTypeTone(
  type: EvaluationType,
): "info" | "warning" | "success" | "danger" {
  switch (type) {
    case "interrogation":
      return "info";
    case "devoir":
      return "warning";
    case "composition":
      return "success";
    case "examen":
      return "danger";
    default:
      return "info";
  }
}
