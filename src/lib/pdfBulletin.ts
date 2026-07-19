import type { GradeRow, Profile, School, Subject } from "@/lib/types";
import {
  ANNUAL_PERIOD_LABEL,
  PASSING_AVERAGE,
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  type AverageOptions,
} from "@/lib/averages";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function formatDay(day: number) {
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1 || n > 7) return "Jour inconnu";
  return DAYS[n] ?? `Jour ${n}`;
}

export interface BulletinData {
  school: School;
  student: Profile;
  className: string;
  periodLabel: string;
  grades: (GradeRow & { subject?: Subject })[];
  /** All year grades — used for moyenne annuelle (T1+T2+T3)/3 */
  allGrades?: (GradeRow & { subject?: Subject })[];
  /** Class-specific coefficients (filière) */
  coefficientBySubject?: AverageOptions["coefficientBySubject"];
}

function effectiveCoef(
  subjectId: string | undefined,
  defaultCoef: number | undefined,
  map?: AverageOptions["coefficientBySubject"],
) {
  if (subjectId && map) {
    const v = map instanceof Map ? map.get(subjectId) : map[subjectId];
    if (v !== undefined && Number(v) > 0) return Number(v);
  }
  return defaultCoef && defaultCoef > 0 ? defaultCoef : 1;
}

function appendAnnualSection(
  doc: jsPDF,
  startY: number,
  data: BulletinData,
): number {
  const sourceGrades = data.allGrades ?? data.grades;
  const annual = computeAnnualAverage(sourceGrades, {
    coefficientBySubject: data.coefficientBySubject,
  });

  let y = startY;

  doc.setFontSize(11);
  doc.setTextColor(15, 118, 110);
  doc.text("Moyenne annuelle (3 trimestres)", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Période", "Moyenne générale /20"]],
    body: annual.trimesters.map((t) => [
      t.periodLabel,
      formatAverage(t.generalAverage),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  y =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y;
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Moyenne annuelle : ${formatAverage(annual.annualAverage)} / 20`,
    14,
    y,
  );
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Formule : (T1 + T2 + T3) / ${annual.trimesterCount || 3} — seuil d’admission : ${PASSING_AVERAGE} / 20`,
    14,
    y,
  );
  y += 8;

  if (annual.annualAverage !== null) {
    const decision = formatPassDecision(annual);
    doc.setFontSize(12);
    doc.setTextColor(
      annual.passed ? 21 : 185,
      annual.passed ? 128 : 28,
      annual.passed ? 61 : 28,
    );
    doc.text(
      `Décision : ${decision}${annual.complete ? "" : " (provisoire)"}`,
      14,
      y,
    );
    y += 10;
  }

  return y;
}

export function generateBulletinPdf(data: BulletinData): jsPDF {
  const doc = new jsPDF();
  const studentName = [data.student.first_name, data.student.last_name]
    .filter(Boolean)
    .join(" ");

  const isAnnual = data.periodLabel === ANNUAL_PERIOD_LABEL;
  const averages = computeWeightedAverage(data.grades, {
    coefficientBySubject: data.coefficientBySubject,
  });

  doc.setFontSize(18);
  doc.setTextColor(15, 118, 110);
  doc.text("EduFaso — Bulletin scolaire", 14, 20);

  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(data.school.name, 14, 30);
  if (data.school.city) doc.text(data.school.city, 14, 36);

  doc.setFontSize(10);
  doc.text(`Élève : ${studentName}`, 14, 48);
  doc.text(`Classe : ${data.className}`, 14, 54);
  doc.text(
    `Période : ${isAnnual ? "Année scolaire (moyenne annuelle)" : data.periodLabel}`,
    14,
    60,
  );

  let y = 68;

  if (isAnnual) {
    y = appendAnnualSection(doc, y, data);
  } else {
    const detailRows = data.grades.map((g) => {
      const absent = (g as { is_absent?: boolean }).is_absent;
      const on20 = absent
        ? "—"
        : g.max_score > 0
          ? ((g.score / g.max_score) * 20).toFixed(2)
          : "—";
      const coef = effectiveCoef(
        g.subject_id ?? g.subject?.id,
        g.subject?.coefficient,
        data.coefficientBySubject,
      );
      return [
        g.subject?.name ?? "—",
        String(coef),
        absent ? "Absent" : `${g.score} / ${g.max_score}`,
        on20,
        g.comment ?? "",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Matière", "Coef.", "Note", "/20", "Commentaire"]],
      body: detailRows.length
        ? detailRows
        : [["—", "—", "—", "—", "Aucune note"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    y =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? 100;
    y += 10;

    if (averages.subjects.length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(15, 118, 110);
      doc.text("Moyennes par matière (coefs de la classe)", 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Matière", "Coef.", "Moyenne /20", "Points (note × coef)"]],
        body: averages.subjects.map((s) => [
          s.subjectName,
          String(s.coefficient),
          formatAverage(s.averageOn20),
          formatAverage(s.averageOn20 * s.coefficient),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 118, 110] },
      });

      y =
        (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? y;
      y += 12;

      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text(
        `Moyenne générale : ${formatAverage(averages.generalAverage)} / 20`,
        14,
        y,
      );
      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Formule : Σ (note × coef) / Σ coef = ${formatAverage(averages.weightedSum)} / ${formatAverage(averages.totalCoefficients, 1)}`,
        14,
        y,
      );
      y += 12;
    }

    // Always append annual decision when we have year grades.
    if ((data.allGrades?.length ?? 0) > 0 || data.grades.length > 0) {
      y = appendAnnualSection(doc, y, data);
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, y);

  return doc;
}
