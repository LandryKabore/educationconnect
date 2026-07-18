import type { EvaluationType } from "@/lib/types";

export const EVALUATION_TYPES: EvaluationType[] = [
  "interrogation",
  "devoir",
  "composition",
  "examen",
];

const LABELS: Record<EvaluationType, string> = {
  interrogation: "Interrogation",
  devoir: "Devoir",
  composition: "Composition",
  examen: "Examen",
};

const SHORT: Record<EvaluationType, string> = {
  interrogation: "Interro",
  devoir: "Devoir",
  composition: "Compo",
  examen: "Examen",
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
