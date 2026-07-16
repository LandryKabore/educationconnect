export type SetupStepId =
  | "profil"
  | "annee"
  | "matieres"
  | "classes"
  | "programmes"
  | "enseignants"
  | "affectations"
  | "eleves"
  | "parents"
  | "emploi";

export type SetupStepStatus = "done" | "todo" | "optional";

export interface SetupStepDef {
  id: SetupStepId;
  order: number;
  title: string;
  description: string;
  to: string;
  optional?: boolean;
}

export const SCHOOL_SETUP_STEPS: SetupStepDef[] = [
  {
    id: "profil",
    order: 1,
    title: "Profil de l’école",
    description: "Vérifiez le nom, l’adresse, le téléphone et le type d’établissement.",
    to: "/ecole/parametres",
  },
  {
    id: "annee",
    order: 2,
    title: "Année scolaire",
    description: "Créez l’année en cours et marquez-la comme courante.",
    to: "/annees",
  },
  {
    id: "matieres",
    order: 3,
    title: "Matières",
    description: "Cochez les matières du catalogue de l’école.",
    to: "/matieres",
  },
  {
    id: "classes",
    order: 4,
    title: "Classes",
    description: "Cochez les classes de l’année scolaire.",
    to: "/classes",
  },
  {
    id: "programmes",
    order: 5,
    title: "Programme par classe",
    description:
      "Appliquez les matières à une ou plusieurs classes (coefs ajustables ensuite).",
    to: "/programmes",
  },
  {
    id: "enseignants",
    order: 6,
    title: "Enseignants",
    description: "Créez les comptes enseignants et communiquez leurs identifiants.",
    to: "/enseignants",
  },
  {
    id: "affectations",
    order: 7,
    title: "Affectations",
    description: "Associez chaque enseignant à une classe et une matière.",
    to: "/enseignants?assign=1",
  },
  {
    id: "eleves",
    order: 8,
    title: "Élèves",
    description: "Inscrivez les élèves et rattachez-les à leur classe.",
    to: "/eleves",
  },
  {
    id: "parents",
    order: 9,
    title: "Parents",
    description: "Créez les comptes parents et liez-les à leurs enfants.",
    to: "/parents",
    optional: true,
  },
  {
    id: "emploi",
    order: 10,
    title: "Emploi du temps",
    description: "Planifiez les créneaux (jour, horaire, salle).",
    to: "/emplois-du-temps",
    optional: true,
  },
];

export interface SetupCounts {
  profileComplete: boolean;
  years: number;
  currentYear: boolean;
  subjects: number;
  classes: number;
  /** Classes that have at least one matière in programme_classe */
  classesWithProgramme: number;
  teachers: number;
  assignments: number;
  students: number;
  enrollments: number;
  parents: number;
  timetableSlots: number;
}

export function evaluateSetupStep(
  id: SetupStepId,
  counts: SetupCounts,
): SetupStepStatus {
  switch (id) {
    case "profil":
      return counts.profileComplete ? "done" : "todo";
    case "annee":
      return counts.years > 0 && counts.currentYear ? "done" : "todo";
    case "matieres":
      return counts.subjects > 0 ? "done" : "todo";
    case "classes":
      return counts.classes > 0 ? "done" : "todo";
    case "programmes":
      return counts.classes > 0 &&
        counts.classesWithProgramme >= counts.classes
        ? "done"
        : "todo";
    case "enseignants":
      return counts.teachers > 0 ? "done" : "todo";
    case "affectations":
      return counts.assignments > 0 ? "done" : "todo";
    case "eleves":
      return counts.students > 0 && counts.enrollments > 0 ? "done" : "todo";
    case "parents":
      return counts.parents > 0 ? "done" : "optional";
    case "emploi":
      return counts.timetableSlots > 0 ? "done" : "optional";
    default:
      return "todo";
  }
}

export function setupProgress(counts: SetupCounts) {
  const required = SCHOOL_SETUP_STEPS.filter((s) => !s.optional);
  const doneRequired = required.filter(
    (s) => evaluateSetupStep(s.id, counts) === "done",
  ).length;
  const allDone = SCHOOL_SETUP_STEPS.filter(
    (s) => evaluateSetupStep(s.id, counts) === "done",
  ).length;
  return {
    doneRequired,
    totalRequired: required.length,
    allDone,
    total: SCHOOL_SETUP_STEPS.length,
    percent: Math.round((doneRequired / required.length) * 100),
    complete: doneRequired === required.length,
  };
}
