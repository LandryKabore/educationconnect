import jsPDF from "jspdf";
import { timeToMinutes } from "@/lib/timetableConflicts";

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
  { day: 1, label: "Lundi", fill: [125, 211, 252] as const, text: [8, 47, 73] as const },
  { day: 2, label: "Mardi", fill: [110, 231, 183] as const, text: [2, 44, 34] as const },
  { day: 3, label: "Mercredi", fill: [252, 211, 77] as const, text: [69, 26, 3] as const },
  { day: 4, label: "Jeudi", fill: [253, 164, 175] as const, text: [76, 5, 25] as const },
  { day: 5, label: "Vendredi", fill: [196, 181, 253] as const, text: [46, 16, 101] as const },
  { day: 6, label: "Samedi", fill: [94, 234, 212] as const, text: [19, 78, 74] as const },
] as const;

/** Visible pastels for print — stronger than UI *-50 so fills read clearly on paper. */
const SLOT_PALETTE = [
  { fill: [186, 230, 253] as const, border: [14, 165, 233] as const }, // sky
  { fill: [167, 243, 208] as const, border: [16, 185, 129] as const }, // emerald
  { fill: [253, 230, 138] as const, border: [245, 158, 11] as const }, // amber
  { fill: [254, 205, 211] as const, border: [244, 63, 94] as const }, // rose
  { fill: [221, 214, 254] as const, border: [139, 92, 246] as const }, // violet
  { fill: [153, 246, 228] as const, border: [20, 184, 166] as const }, // teal
  { fill: [253, 186, 116] as const, border: [249, 115, 22] as const }, // orange
  { fill: [196, 181, 253] as const, border: [124, 58, 237] as const }, // purple
  { fill: [165, 243, 252] as const, border: [6, 182, 212] as const }, // cyan
  { fill: [190, 242, 100] as const, border: [132, 204, 22] as const }, // lime
  { fill: [249, 168, 212] as const, border: [236, 72, 153] as const }, // pink
  { fill: [252, 211, 77] as const, border: [202, 138, 4] as const }, // yellow
] as const;

type SlotColor = (typeof SLOT_PALETTE)[number];

const DEFAULT_START_MIN = 7 * 60;
const DEFAULT_END_MIN = 17 * 60;

function hhmm(t: string) {
  return (t ?? "").slice(0, 5);
}

function formatHourLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function subjectHash(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 997;
  return h;
}

/** Prefer distinct colors within one PDF; same subject always keeps the same color. */
function buildSubjectColorMap(subjectNames: string[]): Map<string, SlotColor> {
  const unique = [
    ...new Set(subjectNames.map((n) => (n || "Cours").trim() || "Cours")),
  ];
  const used = new Set<number>();
  const map = new Map<string, SlotColor>();

  for (const name of unique) {
    let idx = subjectHash(name) % SLOT_PALETTE.length;
    if (used.has(idx)) {
      for (let step = 1; step < SLOT_PALETTE.length; step++) {
        const next = (idx + step) % SLOT_PALETTE.length;
        if (!used.has(next)) {
          idx = next;
          break;
        }
      }
    }
    used.add(idx);
    map.set(name, SLOT_PALETTE[idx]);
  }
  return map;
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

  let rangeStart = DEFAULT_START_MIN;
  let rangeEnd = DEFAULT_END_MIN;
  let min = Infinity;
  let max = -Infinity;
  for (const s of slots) {
    min = Math.min(min, timeToMinutes(s.start_time));
    max = Math.max(max, timeToMinutes(s.end_time));
  }
  rangeStart = Math.min(DEFAULT_START_MIN, Math.floor(min / 60) * 60);
  rangeEnd = Math.max(DEFAULT_END_MIN, Math.ceil(max / 60) * 60);
  const totalMinutes = Math.max(rangeEnd - rangeStart, 60);
  const mmPerMin = bodyH / totalMinutes;

  const hourMarks: number[] = [];
  for (let m = rangeStart; m <= rangeEnd; m += 60) hourMarks.push(m);

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
    doc.setFillColor(d.fill[0], d.fill[1], d.fill[2]);
    doc.setDrawColor(30, 41, 59);
    doc.rect(x, gridTop, dayColW, headerRowH, "FD");
    doc.setTextColor(d.text[0], d.text[1], d.text[2]);
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
  for (const m of hourMarks) {
    const y = bodyTop + (m - rangeStart) * mmPerMin;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    if (m > rangeStart) {
      doc.line(gridLeft + timeColW, y, gridRight, y);
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(gridLeft, y, gridLeft + timeColW, y);
    doc.setTextColor(71, 85, 105);
    if (m < rangeEnd) {
      doc.text(formatHourLabel(m), gridLeft + timeColW - 1.5, y + 2.2, {
        align: "right",
      });
    }
  }

  // —— Lesson cards ——
  const subjectColors = buildSubjectColorMap(slots.map((s) => s.subjectName));
  const padX = 1.2;
  for (const slot of slots) {
    const dayIdx = DAYS.findIndex((d) => d.day === slot.day_of_week);
    if (dayIdx < 0) continue;

    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    const durationMin = Math.max(end - start, 1);
    const top = bodyTop + Math.max(0, (start - rangeStart) * mmPerMin);
    const height = Math.max(5.5, durationMin * mmPerMin - 0.6);
    const x = gridLeft + timeColW + dayIdx * dayColW + padX;
    const w = dayColW - padX * 2;
    const subjectKey = (slot.subjectName || "Cours").trim() || "Cours";
    const palette = subjectColors.get(subjectKey) ?? SLOT_PALETTE[0];

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
