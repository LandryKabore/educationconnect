/**
 * Pure helpers shared by the bulletin PDF (`pdfBulletin.ts`) and the on-screen
 * `BulletinView`. No jsPDF import here, so screens stay light.
 */
import {
  ANNUAL_PERIOD_LABEL,
  PASSING_AVERAGE,
  formatAverageFr,
  formatPassDecision,
  type AnnualAverageResult,
} from "@/lib/averages";

export const fmtFr = (n: number | null | undefined, digits = 2) =>
  formatAverageFr(n, digits);

export function fmtEcartFr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(2).replace(".", ",")}`;
}

/** Auto mention from moyenne générale — never blank because of missing teacher text. */
export function bulletinMention(avg: number | null | undefined): string {
  if (avg === null || avg === undefined || Number.isNaN(avg)) return "—";
  if (avg >= 16) return "Félicitations";
  if (avg >= 14) return "Encouragements";
  if (avg >= 12) return "Compliments";
  if (avg >= PASSING_AVERAGE) return "Passable";
  return "Insuffisant";
}

/** Auto appréciation per subject, from the subject average (never blank). */
export function subjectAppreciation(avg: number | null | undefined): string {
  if (avg === null || avg === undefined || Number.isNaN(avg)) return "—";
  if (avg >= 16) return "Très bien";
  if (avg >= 14) return "Bien";
  if (avg >= 12) return "Assez bien";
  if (avg >= 10) return "Passable";
  if (avg >= 8) return "Insuffisant";
  return "Faible";
}

/** "1er" / "8e": returns the number and the suffix to print in superscript. */
export function ordinal(n: number): { num: string; sup: string } {
  return { num: String(n), sup: n === 1 ? "er" : "e" };
}

export function ordinalText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return "—";
  const o = ordinal(n);
  return `${o.num}${o.sup}`;
}

/** Trimester number for "Trimestre 2" → 2, else null. */
export function trimesterNumber(periodLabel: string): number | null {
  const m = /^Trimestre\s+(\d)$/.exec(periodLabel.trim());
  return m ? Number(m[1]) : null;
}

/** Title split so the ordinal suffix can be drawn in superscript. */
export function bulletinTitleParts(periodLabel: string): {
  before: string;
  sup: string;
  after: string;
} {
  if (periodLabel === ANNUAL_PERIOD_LABEL) {
    return { before: "Bulletin de notes annuel", sup: "", after: "" };
  }
  const n = trimesterNumber(periodLabel);
  if (n) {
    const o = ordinal(n);
    return { before: `Bulletin de notes du ${o.num}`, sup: o.sup, after: " trimestre" };
  }
  return { before: `Bulletin de notes — ${periodLabel}`, sup: "", after: "" };
}

export function bulletinTitle(periodLabel: string): string {
  const t = bulletinTitleParts(periodLabel);
  return `${t.before}${t.sup}${t.after}`;
}

export function genderLabel(g: string | null | undefined): string | null {
  if (!g) return null;
  const v = g.trim().toUpperCase();
  if (v.startsWith("F")) return "F";
  if (v.startsWith("M") || v.startsWith("G") || v === "H") return "M";
  return null;
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** "2012-03-14" → "14 mars 2012" (no time-zone shift). */
export function frenchDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

export function frenchToday(d = new Date()): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function absencesText(n: number): string {
  if (!n) return "Aucune absence non justifiée";
  return `${n} jour${n > 1 ? "s" : ""} d’absence non justifiée`;
}

export function latesText(n: number): string {
  if (!n) return "Aucun retard";
  return `${n} jour${n > 1 ? "s" : ""} de retard`;
}

type SubjectLike = { subject_name: string; student_avg: number; class_avg: number; coefficient: number };

export function bulletinTotals(subjects: SubjectLike[]) {
  let coef = 0;
  let total = 0;
  for (const s of subjects) {
    const c = Number(s.coefficient) || 0;
    const a = Number(s.student_avg);
    if (!Number.isFinite(a)) continue;
    coef += c;
    total += a * c;
  }
  return { coef, total, average: coef > 0 ? total / coef : null };
}

function subjectForSentence(name: string): string {
  // keep acronyms (SVT, EPS, ESPC); lowercase ordinary names (Mathématiques → mathématiques)
  return name
    .split(/(\s+|-)/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join("");
}

/** Up to two subjects to work on: below 12 or below the class average, weakest first. */
function weakSubjects(subjects: SubjectLike[]): string[] {
  return subjects
    .filter(
      (s) =>
        Number.isFinite(s.student_avg) &&
        (s.student_avg < 12 || s.student_avg < s.class_avg),
    )
    .sort((a, b) => a.student_avg - b.student_avg)
    .slice(0, 2)
    .map((s) => subjectForSentence(s.subject_name));
}

/** Automatic « appréciation du conseil de classe », built from the mention. */
export function conseilSentence(opts: {
  average: number | null | undefined;
  subjects: SubjectLike[];
  isAnnual: boolean;
  annual?: Pick<AnnualAverageResult, "passed" | "complete" | "annualAverage"> | null;
}): string {
  const { average, subjects, isAnnual, annual } = opts;
  const weak = weakSubjects(subjects);
  const focus =
    weak.length === 0
      ? ""
      : `, en particulier en ${weak.join(" et en ")}`;
  const lead = (tri: string, year: string) => (isAnnual ? year : tri);
  let text: string;
  if (average === null || average === undefined || Number.isNaN(average)) {
    text = "Moyenne générale non disponible pour cette période.";
  } else if (average >= 16) {
    text = `${lead("Excellent trimestre", "Excellents résultats sur l’année")}. Le conseil de classe adresse ses félicitations à l’élève.`;
  } else if (average >= 14) {
    text = `${lead("Très bon trimestre", "Très bons résultats sur l’année")}. Le conseil de classe adresse ses encouragements à l’élève et l’invite à maintenir ses efforts${focus}.`;
  } else if (average >= 12) {
    text = `${lead("Bon trimestre", "Bons résultats sur l’année")}. Le conseil de classe adresse ses compliments à l’élève et l’invite à poursuivre ses efforts${focus}.`;
  } else if (average >= PASSING_AVERAGE) {
    text = `${lead("Trimestre passable", "Résultats passables sur l’année")}. Le conseil de classe invite l’élève à fournir davantage d’efforts${focus}.`;
  } else {
    text = `${lead("Trimestre insuffisant", "Résultats insuffisants sur l’année")}. Le conseil de classe demande à l’élève un travail plus régulier et plus soutenu${focus}.`;
  }
  if (isAnnual && annual) {
    const decision = formatPassDecision(annual);
    if (decision !== "—") {
      text += ` Décision : ${decision}${annual.complete ? "" : " (provisoire)"}.`;
    }
  }
  return text;
}

/** Short tab label: "Trimestre 2" → "T2", "Année" stays. */
export function periodTabLabel(p: string): string {
  if (p === ANNUAL_PERIOD_LABEL) return "Année";
  const m = /^Trimestre\s+(\d)$/.exec(p);
  return m ? `T${m[1]}` : p;
}
