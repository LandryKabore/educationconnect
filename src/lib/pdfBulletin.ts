import type { GradeRow, Profile, School, Subject } from "@/lib/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function formatDay(day: number) {
  return DAYS[day] ?? `Jour ${day}`;
}

export interface BulletinData {
  school: School;
  student: Profile;
  className: string;
  periodLabel: string;
  grades: (GradeRow & { subject?: Subject })[];
}

export function generateBulletinPdf(data: BulletinData): jsPDF {
  const doc = new jsPDF();
  const studentName = [data.student.first_name, data.student.last_name]
    .filter(Boolean)
    .join(" ");

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

  const rows = data.grades.map((g) => {
    const pct = g.max_score > 0 ? ((g.score / g.max_score) * 100).toFixed(1) : "—";
    return [
      g.subject?.name ?? "—",
      g.period_label,
      `${g.score} / ${g.max_score}`,
      `${pct} %`,
      g.comment ?? "",
    ];
  });

  autoTable(doc, {
    startY: 68,
    head: [["Matière", "Période", "Note", "%", "Commentaire"]],
    body: rows.length ? rows : [["—", "—", "—", "—", "Aucune note"]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, finalY + 12);

  return doc;
}
