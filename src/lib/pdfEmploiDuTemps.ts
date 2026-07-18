import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDay } from "@/lib/pdfBulletin";

export type EdtPdfSlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  subjectName: string;
  teacherName?: string | null;
  room?: string | null;
};

export type EmploiDuTempsPdfData = {
  schoolName: string;
  studentName: string;
  className: string;
  slots: EdtPdfSlot[];
};

function hhmm(t: string) {
  return (t ?? "").slice(0, 5);
}

function cellText(slot: EdtPdfSlot | undefined) {
  if (!slot) return "";
  const lines = [slot.subjectName || "Cours", `${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`];
  if (slot.teacherName?.trim()) lines.push(slot.teacherName.trim());
  if (slot.room?.trim()) lines.push(`Salle ${slot.room.trim()}`);
  return lines.join("\n");
}

/** Landscape weekly grid PDF for student (or class) timetable. */
export function generateEmploiDuTempsPdf(data: EmploiDuTempsPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const days = [1, 2, 3, 4, 5, 6] as const;

  doc.setFontSize(16);
  doc.setTextColor(15, 118, 110);
  doc.text("EduFaso — Emploi du temps", 14, 16);

  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(data.schoolName || "École", 14, 24);
  doc.text(`Élève : ${data.studentName || "—"}`, 14, 30);
  doc.text(`Classe : ${data.className || "—"}`, 14, 36);

  const slots = [...data.slots].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
  });

  const timeKeys = [
    ...new Set(slots.map((s) => hhmm(s.start_time)).filter(Boolean)),
  ].sort();

  if (timeKeys.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("Aucun créneau planifié.", 14, 50);
    doc.setFontSize(8);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 60);
    return doc;
  }

  const byDayStart = new Map<string, EdtPdfSlot>();
  for (const s of slots) {
    byDayStart.set(`${s.day_of_week}|${hhmm(s.start_time)}`, s);
  }

  const body = timeKeys.map((start) => {
    const row: string[] = [start];
    for (const day of days) {
      row.push(cellText(byDayStart.get(`${day}|${start}`)));
    }
    return row;
  });

  autoTable(doc, {
    startY: 42,
    head: [["Heure", ...days.map((d) => formatDay(d))]],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      valign: "top",
      overflow: "linebreak",
      minCellHeight: 14,
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 18, halign: "center", valign: "middle", fontStyle: "bold" },
    },
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index > 0 && hook.cell.raw) {
        hook.cell.styles.fillColor = [240, 253, 250];
      }
    },
  });

  const y =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 50;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, y + 8);

  return doc;
}
