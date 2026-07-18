export type AssignmentKind = "exercice_maison" | "examen";

export const ASSIGNMENT_KINDS: AssignmentKind[] = [
  "exercice_maison",
  "examen",
];

export function isAssignmentKind(value: string): value is AssignmentKind {
  return value === "exercice_maison" || value === "examen";
}

export function assignmentKindLabel(kind: AssignmentKind, plural = false) {
  if (kind === "examen") return plural ? "Examens" : "Examen";
  return plural ? "Exercices de maison" : "Exercice de maison";
}

export function assignmentKindShort(kind: AssignmentKind, plural = false) {
  if (kind === "examen") return plural ? "Examens" : "Examen";
  return plural ? "Exercices" : "Exercice";
}

export function assignmentKindPath(kind: AssignmentKind, forStudent = false) {
  if (forStudent) {
    return kind === "examen" ? "/mes-examens" : "/mes-exercices";
  }
  return kind === "examen" ? "/examens" : "/exercices-maison";
}

export function assignmentKindEmpty(kind: AssignmentKind) {
  return kind === "examen"
    ? "Aucun examen pour le moment."
    : "Aucun exercice de maison pour le moment.";
}

export function assignmentKindCreateLabel(kind: AssignmentKind) {
  return kind === "examen" ? "Nouvel examen" : "Nouvel exercice";
}

export function assignmentKindCreatedToast(kind: AssignmentKind) {
  return kind === "examen" ? "Examen créé" : "Exercice créé";
}

export function assignmentKindDueLabel(kind: AssignmentKind) {
  return kind === "examen" ? "Date de l’examen" : "Date limite";
}

export function assignmentKindSubmitLabel(kind: AssignmentKind) {
  return kind === "examen" ? "Rendre l’examen" : "Rendre l’exercice";
}

export function assignmentKindSubmittedToast(kind: AssignmentKind) {
  return kind === "examen" ? "Examen rendu" : "Exercice rendu";
}
