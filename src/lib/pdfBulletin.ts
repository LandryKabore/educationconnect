import type { GradeRow, Profile, School, Subject } from "@/lib/types";
import {
  computeWeightedAverage,
  formatAverage,
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

export function generateBulletinPdf(data: BulletinData): jsPDF {
  const doc = new jsPDF();
  const studentName = [data.student.first_name, data.student.last_name]
    .filter(Boolean)
    .join(" ");

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
  doc.text(`Période : ${data.periodLabel}`, 14, 60);

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
    startY: 68,
    head: [["Matière", "Coef.", "Note", "/20", "Commentaire"]],
    body: detailRows.length
      ? detailRows
      : [["—", "—", "—", "—", "Aucune note"]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  let y =
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
    y += 10;
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, y);

  return doc;
}
