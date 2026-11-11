import jsPDF from "jspdf";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { subjectSwatch } from "@/lib/subjectColors";
import {
  buildTimeScale,
  findPauseBands,
  formatClock,
  formatPauseLabel,
  timetableBounds,
} from "@/lib/timetableLayout";

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
  className: string;
  /** Shown as "Élève : …" when set (student / parent export). */
  studentName?: string | null;
  /** Extra header line (e.g. teacher filter for school admin). */
  extraLine?: string | null;
  slots: EdtPdfSlot[];
};

const DAYS = [
  { day: 1, label: "Lundi" },
  { day: 2, label: "Mardi" },
  { day: 3, label: "Mercredi" },
  { day: 4, label: "Jeudi" },
  { day: 5, label: "Vendredi" },
  { day: 6, label: "Samedi" },
] as const;

function hhmm(t: string) {
  return (t ?? "").slice(0, 5);
}

function roundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: "S" | "F" | "FD",
) {
  const radius = Math.min(r, w / 2, h / 2);
  doc.roundedRect(x, y, w, h, radius, radius, style);
}

/** Landscape weekly calendar PDF — mirrors the in-app TimetableGrid. */
export function generateEmploiDuTempsPdf(data: EmploiDuTempsPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const marginX = 10;
  const headerBottom = 34;
  const footerY = pageH - 8;
  const gridTop = headerBottom;
  const gridBottom = footerY - 6;
  const headerRowH = 8;
  const timeColW = 14;
  const gridLeft = marginX;
  const gridRight = pageW - marginX;
  const gridW = gridRight - gridLeft;
  const dayColW = (gridW - timeColW) / DAYS.length;
  const bodyTop = gridTop + headerRowH;
  const bodyH = gridBottom - bodyTop;

  // —— Page header ——
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 118, 110);
  doc.text("EduFaso — Emploi du temps", marginX, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(data.schoolName || "École", marginX, 19);
  let y = 25;
  doc.text(`Classe : ${data.className || "—"}`, marginX, y);
  y += 6;
  if (data.studentName) {
    doc.text(`Élève : ${data.studentName}`, marginX, y);
    y += 6;
  }
  if (data.extraLine) {
    doc.text(data.extraLine, marginX, y);
  }

  const slots = data.slots ?? [];
  if (slots.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("Aucun créneau planifié.", marginX, 50);
    doc.setFontSize(8);
    doc.text(
      `Généré le ${new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
      marginX,
      footerY,
    );
    return doc;
  }

  const bounds = timetableBounds(slots);
  const pauses = findPauseBands(slots, bounds.rangeStart, bounds.rangeEnd);
  const pauseMm = 6;
  const scaledMinutes = Math.max(
    60,
    bounds.rangeEnd -
      bounds.rangeStart -
      pauses.reduce((sum, pause) => sum + (pause.endMin - pause.startMin), 0),
  );
  const mmPerMin = (bodyH - pauses.length * pauseMm) / scaledMinutes;
  const scale = buildTimeScale({
    rangeStart: bounds.rangeStart,
    rangeEnd: bounds.rangeEnd,
    pauses,
    pxPerMin: mmPerMin,
    pausePx: pauseMm,
  });

  // Outer frame
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.45);
  doc.rect(gridLeft, gridTop, gridW, gridBottom - gridTop);

  // —— Day headers ——
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  // "Heure" corner
  doc.setFillColor(248, 250, 252);
  doc.rect(gridLeft, gridTop, timeColW, headerRowH, "FD");
  doc.setTextColor(51, 65, 85);
  doc.text("Heure", gridLeft + timeColW / 2, gridTop + headerRowH / 2 + 1, {
    align: "center",
  });

  DAYS.forEach((d, i) => {
    const x = gridLeft + timeColW + i * dayColW;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(30, 41, 59);
    doc.rect(x, gridTop, dayColW, headerRowH, "FD");
    doc.setTextColor(51, 65, 85);
    doc.text(d.label, x + dayColW / 2, gridTop + headerRowH / 2 + 1, {
      align: "center",
    });
  });

  // Horizontal divider under headers
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.45);
  doc.line(gridLeft, bodyTop, gridRight, bodyTop);

  // Time column background
  doc.setFillColor(248, 250, 252);
  doc.rect(gridLeft, bodyTop, timeColW, bodyH, "F");

  // Vertical day separators + hour lines
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.line(gridLeft + timeColW, gridTop, gridLeft + timeColW, gridBottom);
  for (let i = 1; i < DAYS.length; i++) {
    const x = gridLeft + timeColW + i * dayColW;
    doc.line(x, gridTop, x, gridBottom);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  for (const m of scale.hourMarks) {
    const y = bodyTop + scale.minuteToY(m);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    if (m > scale.rangeStart) {
      doc.line(gridLeft + timeColW, y, gridRight, y);
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(gridLeft, y, gridLeft + timeColW, y);
    doc.setTextColor(71, 85, 105);
    if (m < scale.rangeEnd) {
      doc.text(formatClock(m), gridLeft + timeColW - 1.5, y + 2.2, {
        align: "right",
      });
    }
  }

  for (const region of scale.regions) {
    if (region.kind !== "pause") continue;
    const y = bodyTop + region.y;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.rect(gridLeft, y, gridW, region.height, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      formatPauseLabel(region.startMin, region.endMin),
      gridLeft + gridW / 2,
      y + region.height / 2 + 1,
      { align: "center" },
    );
  }

  // —— Lesson cards ——
  const padX = 1.2;
  for (const slot of slots) {
    const dayIdx = DAYS.findIndex((d) => d.day === slot.day_of_week);
    if (dayIdx < 0) continue;

    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    const top = bodyTop + scale.minuteToY(start);
    const height = Math.max(5.5, scale.minuteToY(end) - scale.minuteToY(start) - 0.6);
    const x = gridLeft + timeColW + dayIdx * dayColW + padX;
    const w = dayColW - padX * 2;
    const palette = subjectSwatch(slot.subjectName);

    doc.setFillColor(palette.fill[0], palette.fill[1], palette.fill[2]);
    doc.setDrawColor(palette.border[0], palette.border[1], palette.border[2]);
    doc.setLineWidth(0.45);
    roundedRect(doc, x, top, w, height, 1.2, "FD");

    const timeLabel = `${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`;
    const subject = (slot.subjectName || "Cours").trim();
    const teacher = slot.teacherName?.trim() || "";
    const room = slot.room?.trim() ? `Salle ${slot.room.trim()}` : "";

    const textX = x + 1.4;
    const maxTextW = w - 2.8;
    let cursorY = top + 2.8;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");

    if (height < 7) {
      doc.setFontSize(5.5);
      const line = doc.splitTextToSize(`${subject} · ${timeLabel}`, maxTextW);
      doc.text(line[0] ?? subject, textX, cursorY);
      continue;
    }

    doc.setFontSize(height < 10 ? 6.5 : 7.5);
    const titleLines = doc.splitTextToSize(subject, maxTextW);
    const title = titleLines[0] ?? subject;
    doc.text(title, textX, cursorY);
    cursorY += height < 10 ? 2.6 : 3.2;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(5.5);

    if (cursorY + 1.8 < top + height - 1) {
      doc.text(timeLabel, textX, cursorY);
      cursorY += 2.6;
    }
    if (teacher && cursorY + 1.8 < top + height - 1) {
      const tLines = doc.splitTextToSize(teacher, maxTextW);
      doc.text(tLines[0] ?? teacher, textX, cursorY);
      cursorY += 2.6;
    }
    if (room && cursorY + 1.8 < top + height - 1) {
      doc.text(room, textX, cursorY);
    }
  }

  // Outer border again on top of cards (crisp frame)
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.45);
  doc.rect(gridLeft, gridTop, gridW, gridBottom - gridTop);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const generated = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`Généré le ${generated}`, marginX, footerY);

  return doc;
}
