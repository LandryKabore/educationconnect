/**
 * One colour per subject, stable across classes and screens.
 * Keyed on the subject name only (no per-grid collision shifting).
 * Common subjects are pinned; anything else hashes into the same palette.
 */

export type SubjectSwatch = {
  /** Card fill. Keeps the dark-mode `dark:!bg-*-900` hooks in index.css. */
  card: string;
  /** 4 px edge. */
  edge: string;
  /** Legend dot and hours bar. */
  dot: string;
  fill: readonly [number, number, number];
  border: readonly [number, number, number];
};

export const SUBJECT_SWATCHES: readonly SubjectSwatch[] = [
  {
    card: "border-sky-500 bg-sky-200 dark:!border-sky-400 dark:!bg-sky-900",
    edge: "bg-sky-600",
    dot: "bg-sky-500",
    fill: [186, 230, 253],
    border: [2, 132, 199],
  },
  {
    card: "border-emerald-500 bg-emerald-200 dark:!border-emerald-400 dark:!bg-emerald-900",
    edge: "bg-emerald-600",
    dot: "bg-emerald-500",
    fill: [167, 243, 208],
    border: [5, 150, 105],
  },
  {
    card: "border-amber-500 bg-amber-200 dark:!border-amber-400 dark:!bg-amber-900",
    edge: "bg-amber-500",
    dot: "bg-amber-500",
    fill: [253, 230, 138],
    border: [217, 119, 6],
  },
  {
    card: "border-violet-500 bg-violet-200 dark:!border-violet-400 dark:!bg-violet-900",
    edge: "bg-violet-600",
    dot: "bg-violet-500",
    fill: [221, 214, 254],
    border: [124, 58, 237],
  },
  {
    card: "border-cyan-500 bg-cyan-200 dark:!border-cyan-400 dark:!bg-cyan-900",
    edge: "bg-cyan-600",
    dot: "bg-cyan-500",
    fill: [165, 243, 252],
    border: [8, 145, 178],
  },
  {
    card: "border-teal-500 bg-teal-200 dark:!border-teal-400 dark:!bg-teal-900",
    edge: "bg-teal-600",
    dot: "bg-teal-500",
    fill: [153, 246, 228],
    border: [13, 148, 136],
  },
  {
    card: "border-lime-500 bg-lime-200 dark:!border-lime-400 dark:!bg-lime-900",
    edge: "bg-lime-600",
    dot: "bg-lime-500",
    fill: [190, 242, 100],
    border: [101, 163, 13],
  },
  {
    card: "border-rose-500 bg-rose-200 dark:!border-rose-400 dark:!bg-rose-900",
    edge: "bg-rose-600",
    dot: "bg-rose-500",
    fill: [254, 205, 211],
    border: [225, 29, 72],
  },
  {
    card: "border-orange-500 bg-orange-200 dark:!border-orange-400 dark:!bg-orange-900",
    edge: "bg-orange-500",
    dot: "bg-orange-500",
    fill: [254, 215, 170],
    border: [234, 88, 12],
  },
  {
    card: "border-purple-500 bg-purple-200 dark:!border-purple-400 dark:!bg-purple-900",
    edge: "bg-purple-600",
    dot: "bg-purple-500",
    fill: [233, 213, 255],
    border: [147, 51, 234],
  },
  {
    card: "border-pink-500 bg-pink-200 dark:!border-pink-400 dark:!bg-pink-900",
    edge: "bg-pink-500",
    dot: "bg-pink-500",
    fill: [251, 207, 232],
    border: [219, 39, 119],
  },
  {
    card: "border-yellow-500 bg-yellow-200 dark:!border-yellow-400 dark:!bg-yellow-800",
    edge: "bg-yellow-500",
    dot: "bg-yellow-500",
    fill: [254, 240, 138],
    border: [202, 138, 4],
  },
] as const;

/** Pinned colours for subjects schools actually type. */
const ALIASES: Record<string, number> = {
  mathematiques: 0,
  maths: 0,
  math: 0,
  calcul: 0,
  francais: 1,
  anglais: 2,
  "histoire geographie": 3,
  "histoire geo": 3,
  "hist geo": 3,
  histgeo: 3,
  histoire: 3,
  geographie: 3,
  "physique chimie": 4,
  pc: 4,
  "sciences physiques": 4,
  "sciences de la vie et de la terre": 5,
  svt: 5,
  "education physique et sportive": 6,
  eps: 6,
  "activites physiques et educatives": 6,
  philosophie: 7,
  philo: 7,
  informatique: 8,
  technologie: 8,
  economie: 9,
  "sciences economiques et sociales": 9,
  ses: 9,
  "arts plastiques": 10,
  musique: 10,
  dessin: 10,
  allemand: 11,
  espagnol: 11,
  "education civique et morale": 2,
};

export function normalizeSubjectName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashIndex(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % 997;
  return h % SUBJECT_SWATCHES.length;
}

/** Same input → same swatch, on every class timetable. */
export function subjectSwatch(name: string | null | undefined): SubjectSwatch {
  const key = normalizeSubjectName(name?.trim() || "Cours") || "cours";
  const pinned = ALIASES[key];
  const index = pinned ?? hashIndex(key);
  return SUBJECT_SWATCHES[index] ?? SUBJECT_SWATCHES[0];
}
