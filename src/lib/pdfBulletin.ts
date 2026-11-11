import type { Profile, School } from "@/lib/types";
import {
  ANNUAL_PERIOD_LABEL,
  PASSING_AVERAGE,
  type AnnualAverageResult,
} from "@/lib/averages";
import {
  absencesText,
  bulletinMention,
  bulletinTitleParts,
  bulletinTotals,
  conseilSentence,
  fmtEcartFr,
  fmtFr,
  frenchDate,
  frenchToday,
  genderLabel,
  latesText,
  ordinal,
  subjectAppreciation,
} from "@/lib/bulletinFormat";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export { bulletinMention } from "@/lib/bulletinFormat";

const DAYS = [
  "",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export function formatDay(day: number) {
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1 || n > 7) return "Jour inconnu";
  return DAYS[n] ?? `Jour ${n}`;
}

export type BulletinSubjectStat = {
  subject_id: string;
  subject_name: string;
  coefficient: number;
  teacher_name: string | null;
  student_avg: number;
  class_avg: number;
  class_min: number;
  class_max: number;
  ecart: number;
  rank: number;
  ranked_count: number;
};

export type BulletinGeneralStat = {
  student_avg: number;
  class_avg: number;
  class_min: number;
  class_max: number;
  ecart: number;
  rank: number;
  ranked_count: number;
};

export type BulletinClassStats = {
  class_name: string | null;
  year_label: string | null;
  class_size: number;
  period_label: string;
  is_annual: boolean;
  subjects: BulletinSubjectStat[];
  general: BulletinGeneralStat | null;
  attendance: { absences: number; lates: number };
};

export interface BulletinData {
  school: School;
  student: Profile;
  className: string;
  periodLabel: string;
  stats: BulletinClassStats;
  /** Used only for annual decision footer when trimesters are incomplete. */
  annual?: Pick<
    AnnualAverageResult,
    "annualAverage" | "passed" | "complete" | "trimesters"
  > | null;
  /** Authenticity QR code (public verification page). Omitted when the register is unavailable. */
  verification?: { code: string; url: string; qrDataUrl: string } | null;
  /** School logo as a PNG/JPEG data URL (EduFaso logo as fallback). Omitted = no logo. */
  logoDataUrl?: string | null;
  /** Date printed in the footer (defaults to today). */
  generatedAt?: Date;
}

// —— Page geometry (mm, A4 portrait) ——
const PAGE_W = 210;
const PAGE_H = 297;
const M = 9.5; // side margin
const CONTENT_W = PAGE_W - 2 * M;
const TABLE_TOP = 84;
/** Top of the QR / signature block, anchored to the bottom of the last page. */
const SIGN_TOP = 256;
const FOOTER_Y = 289.5;

type RGB = [number, number, number];
const INK: RGB = [15, 23, 42];
const SLATE: RGB = [51, 65, 85];
const MUTED: RGB = [100, 116, 139];
const RULE: RGB = [203, 213, 225];
const TEAL: RGB = [15, 118, 110];

/** Standard PDF fonts are WinAnsi only: swap the few characters they cannot draw. */
function pdfSafe(s: string): string {
  return s
    .replace(/\u2212/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/\u202f|\u00a0/g, " ");
}

function setColor(doc: jsPDF, c: RGB) {
  doc.setTextColor(c[0], c[1], c[2]);
}

/** Text with letter spacing; jsPDF alignment ignores charSpace, so align by hand. */
function spacedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  charSpace: number,
  align: "left" | "center" | "right" = "left",
) {
  const s = pdfSafe(text);
  const w = doc.getTextWidth(s) + charSpace * Math.max(0, s.length - 1);
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  doc.setCharSpace(charSpace);
  doc.text(s, left, y);
  doc.setCharSpace(0);
  return w;
}

/** Draws "8e / 42"-style text with the suffix in superscript. Returns the width. */
function supText(
  doc: jsPDF,
  parts: { num: string; sup: string; rest: string },
  x: number,
  y: number,
  size: number,
  align: "left" | "center" | "right" = "left",
  measureOnly = false,
) {
  doc.setFontSize(size);
  const wNum = doc.getTextWidth(parts.num);
  const wRest = doc.getTextWidth(parts.rest);
  doc.setFontSize(size * 0.62);
  const wSup = parts.sup ? doc.getTextWidth(parts.sup) + 0.15 : 0;
  const w = wNum + wSup + wRest;
  if (measureOnly) {
    doc.setFontSize(size);
    return w;
  }
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  doc.setFontSize(size);
  doc.text(parts.num, left, y);
  if (parts.sup) {
    doc.setFontSize(size * 0.62);
    doc.text(parts.sup, left + wNum + 0.1, y - size * 0.13);
    doc.setFontSize(size);
  }
  doc.text(parts.rest, left + wNum + wSup, y);
  return w;
}

function rankParts(rank: number | null | undefined, count: number | null | undefined) {
  if (!rank || rank <= 0) return { num: "—", sup: "", rest: "" };
  const o = ordinal(rank);
  return { num: o.num, sup: o.sup, rest: count ? ` / ${count}` : "" };
}

function capitalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
}

export function generateBulletinPdf(data: BulletinData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const stats = data.stats;
  const school = data.school;
  const student = data.student;
  const isAnnual = data.periodLabel === ANNUAL_PERIOD_LABEL || stats.is_annual;
  const className = stats.class_name || data.className || "—";
  const yearLabel = stats.year_label || null;
  const general = stats.general;
  const generalAvg = general?.student_avg ?? data.annual?.annualAverage ?? null;
  const mention = bulletinMention(generalAvg);
  const subjects = stats.subjects;
  const totals = bulletinTotals(subjects);

  // ———————————————————— Official header ————————————————————
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.3);
  setColor(doc, INK);
  spacedText(doc, "BURKINA FASO", M, 11, 0.35);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.1);
  setColor(doc, [30, 41, 59]);
  doc.text("La Patrie ou la Mort, Nous Vaincrons", M, 14.6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  setColor(doc, INK);
  [
    "MINISTÈRE DE L’ÉDUCATION NATIONALE,",
    "DE L’ALPHABÉTISATION ET DE LA PROMOTION",
    "DES LANGUES NATIONALES",
  ].forEach((line, i) => spacedText(doc, line, PAGE_W - M, 11 + i * 3.1, 0.12, "right"));

  if (data.logoDataUrl) {
    try {
      const props = doc.getImageProperties(data.logoDataUrl);
      const box = 15;
      const ratio = props.width / props.height;
      const w = ratio >= 1 ? box : box * ratio;
      const h = ratio >= 1 ? box / ratio : box;
      doc.addImage(
        data.logoDataUrl,
        props.fileType || "PNG",
        PAGE_W / 2 - w / 2,
        10 + (box - h) / 2,
        w,
        h,
      );
    } catch {
      /* unreadable logo: keep the header without it */
    }
  }

  // double rule
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.7);
  doc.line(M, 29.8, PAGE_W - M, 29.8);
  doc.setLineWidth(0.25);
  doc.line(M, 31.2, PAGE_W - M, 31.2);

  // school name + coordinates
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.2);
  setColor(doc, INK);
  spacedText(doc, (school.name || "École").toUpperCase(), PAGE_W / 2, 38, 0.35, "center");
  const place = [school.address, school.city].filter(Boolean).join(", ");
  const coords = [
    place || null,
    school.phone ? `Tél. ${school.phone}` : null,
    school.email || null,
  ].filter(Boolean) as string[];
  if (coords.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    setColor(doc, SLATE);
    doc.text(pdfSafe(coords.join("  ·  ")), PAGE_W / 2, 42, { align: "center" });
  }

  // title with superscript ordinal
  {
    const t = bulletinTitleParts(data.periodLabel);
    const size = 12;
    const cs = 0.45;
    doc.setFont("helvetica", "bold");
    setColor(doc, INK);
    doc.setFontSize(size);
    const before = t.before.toUpperCase();
    const after = t.after.toUpperCase();
    const wB = doc.getTextWidth(before) + cs * before.length;
    const wA = doc.getTextWidth(after) + cs * Math.max(0, after.length - 1);
    doc.setFontSize(size * 0.62);
    const wS = t.sup ? doc.getTextWidth(t.sup.toUpperCase()) + 0.3 : 0;
    const left = PAGE_W / 2 - (wB + wS + wA) / 2;
    doc.setFontSize(size);
    spacedText(doc, before, left, 49.4, cs);
    if (t.sup) {
      doc.setFontSize(size * 0.62);
      doc.text(t.sup.toUpperCase(), left + wB, 49.4 - 1.6);
      doc.setFontSize(size);
    }
    if (after) spacedText(doc, after, left + wB + wS, 49.4, cs);
  }
  if (yearLabel) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    setColor(doc, SLATE);
    doc.text(pdfSafe(`Année scolaire ${yearLabel}`), PAGE_W / 2, 53.6, { align: "center" });
  }

  // teal accent rule (the page's only colour besides the table header)
  doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setLineWidth(0.8);
  doc.line(M + 21, 56.6, PAGE_W - M - 21, 56.6);

  // ———————————————————— Identity block (full width, no photo) ————————————————————
  const lastName = (student.last_name || "").toUpperCase();
  const firstName = student.first_name ? capitalizeName(student.first_name) : "";
  const fields: { k: string; v: string }[] = [
    { k: "ÉLÈVE", v: [lastName, firstName].filter(Boolean).join(" ") || "—" },
  ];
  const dob = frenchDate(student.date_of_birth);
  if (dob) fields.push({ k: "NÉ(E) LE", v: dob });
  const sex = genderLabel(student.gender);
  if (sex) fields.push({ k: "SEXE", v: sex });
  if (student.matricule) fields.push({ k: "MATRICULE", v: student.matricule });
  fields.push({ k: "CLASSE", v: className });
  if (stats.class_size > 0) {
    fields.push({
      k: "EFFECTIF",
      v: `${stats.class_size} élève${stats.class_size > 1 ? "s" : ""}`,
    });
  }
  const idTop = 60.2;
  const idRows = Math.ceil(fields.length / 3);
  const idRowH = 7.4;
  const idH = 5.4 + idRows * idRowH;
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.4);
  doc.rect(M, idTop, CONTENT_W, idH);
  const colX = [M + 3.5, M + 68, M + 152];
  fields.forEach((f, i) => {
    const x = colX[i % 3];
    const yy = idTop + 5 + Math.floor(i / 3) * idRowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    setColor(doc, SLATE);
    spacedText(doc, f.k, x, yy, 0.15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.3);
    setColor(doc, INK);
    const maxW = (i % 3 === 2 ? PAGE_W - M - 2 : colX[(i % 3) + 1] - 3) - x;
    const v = doc.splitTextToSize(pdfSafe(f.v), maxW)[0] ?? "";
    doc.text(v, x, yy + 3.6);
  });

  // ———————————————————— Subject table ————————————————————
  const tableTop = Math.max(TABLE_TOP, idTop + idH + 3.3);
  const annualRows = isAnnual && (data.annual?.trimesters?.length ?? 0) > 0;
  const summaryH = annualRows ? 26.5 : 23;
  const conseilText = pdfSafe(
    conseilSentence({
      average: generalAvg,
      subjects,
      isAnnual,
      annual: data.annual ?? null,
    }),
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  const conseilLines = doc.splitTextToSize(conseilText, CONTENT_W - 2) as string[];
  const conseilH = 8.5 + conseilLines.length * 3.9;
  const headH = 6.6;
  const totalsH = 6.6;
  const gapAfterTable = 4.5;
  const gapBeforeSigns = 5;
  const n = Math.max(1, subjects.length);
  const avail =
    SIGN_TOP - gapBeforeSigns - conseilH - summaryH - gapAfterTable - tableTop - headH - totalsH - 2;
  const hasTeachers = subjects.some((s) => !!s.teacher_name);
  const rowH = Math.min(10, Math.max(hasTeachers ? 6.5 : 5.6, avail / n));

  const body =
    subjects.length > 0
      ? subjects.map((s) => {
          const total = Number.isFinite(s.student_avg) ? s.student_avg * s.coefficient : null;
          return [
            s.teacher_name ? `${s.subject_name}\n${s.teacher_name}` : s.subject_name,
            String(s.coefficient).replace(".", ","),
            fmtFr(s.student_avg),
            fmtFr(total),
            s.rank ? `${s.rank}e / ${s.ranked_count}` : "—",
            fmtFr(s.class_avg),
            subjectAppreciation(s.student_avg),
          ];
        })
      : [["Aucune moyenne pour cette période", "—", "—", "—", "—", "—", "—"]];

  const generalFromTotals = totals.average;
  const shownGeneral = generalAvg ?? generalFromTotals;
  const totalsLabel =
    subjects.length === 0
      ? "Moyenne générale : —"
      : generalFromTotals !== null &&
          shownGeneral !== null &&
          Math.abs(generalFromTotals - shownGeneral) < 0.006
        ? `Moyenne générale = ${fmtFr(totals.total)} ÷ ${String(totals.coef).replace(".", ",")} = ${fmtFr(shownGeneral)} / 20`
        : `Moyenne générale = ${fmtFr(shownGeneral)} / 20`;

  const subjectIdx = new Map<number, (typeof subjects)[number]>();
  subjects.forEach((s, i) => subjectIdx.set(i, s));

  autoTable(doc, {
    startY: tableTop,
    head: [["Matières", "Coef.", "Moy. /20", "Total", "Rang", "Moy. cl.", "Appréciation"]],
    body,
    foot: [
      [
        { content: "Totaux", styles: { halign: "left" } },
        String(totals.coef || "—").replace(".", ","),
        "—",
        subjects.length ? fmtFr(totals.total) : "—",
        { content: pdfSafe(totalsLabel), colSpan: 3, styles: { halign: "left" } },
      ],
    ],
    showHead: "everyPage",
    showFoot: "lastPage",
    theme: "grid",
    margin: { left: M, right: M, top: 14, bottom: PAGE_H - FOOTER_Y + 6 },
    styles: {
      font: "helvetica",
      fontSize: 7.9,
      textColor: INK,
      lineColor: INK,
      lineWidth: 0.25,
      cellPadding: { top: 1.2, bottom: 1.2, left: 1.6, right: 1.6 },
      valign: "middle",
      minCellHeight: rowH,
    },
    headStyles: {
      fillColor: TEAL,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7.1,
      halign: "center",
      minCellHeight: headH,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: INK,
      fontStyle: "bold",
      fontSize: 7.9,
      halign: "center",
      minCellHeight: totalsH,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 53.5, halign: "left" },
      1: { cellWidth: 14.5, halign: "center" },
      2: { cellWidth: 21.7, halign: "center" },
      3: { cellWidth: 21.1, halign: "center" },
      4: { cellWidth: 21.1, halign: "center" },
      5: { cellWidth: 22.6, halign: "center" },
      6: { cellWidth: "auto", halign: "left", fontSize: 7.5 },
    },
    didParseCell: (hook) => {
      if (hook.section !== "body") return;
      const s = subjectIdx.get(hook.row.index);
      if (!s) return;
      // measured as one line: the teacher's name is drawn by hand, smaller, inside the row
      if (hook.column.index === 0) hook.cell.text = [s.subject_name];
      // a mean below 10 / 20 is bold (not colour-only), so it survives a photocopy
      if (hook.column.index === 2 && s.student_avg < PASSING_AVERAGE) {
        hook.cell.styles.fontStyle = "bold";
      }
    },
    willDrawCell: (hook) => {
      if (hook.section !== "body") return;
      const s = subjectIdx.get(hook.row.index);
      if (!s) return;
      // drawn by hand in didDrawCell: subject + teacher line, rank with superscript
      if (hook.column.index === 0 || (hook.column.index === 4 && s.rank)) {
        hook.cell.text = [];
      }
    },
    didDrawCell: (hook) => {
      if (hook.section === "foot" && hook.column.index === 0) {
        doc.setDrawColor(INK[0], INK[1], INK[2]);
        doc.setLineWidth(0.55);
        doc.line(M, hook.cell.y, PAGE_W - M, hook.cell.y);
        doc.setLineWidth(0.25);
        return;
      }
      if (hook.section !== "body") return;
      const s = subjectIdx.get(hook.row.index);
      if (!s) return;
      const cell = hook.cell;
      const midY = cell.y + cell.height / 2;
      setColor(doc, INK);
      if (hook.column.index === 0) {
        const x = cell.x + 1.6;
        const maxW = cell.width - 3.2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.9);
        const name = (doc.splitTextToSize(pdfSafe(s.subject_name), maxW) as string[])[0];
        if (s.teacher_name) {
          doc.text(name, x, midY - 0.1);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.3);
          setColor(doc, SLATE);
          const t = (doc.splitTextToSize(pdfSafe(s.teacher_name), maxW) as string[])[0];
          doc.text(t, x, midY + 2.9);
        } else {
          doc.text(name, x, midY + 1);
        }
      } else if (hook.column.index === 4 && s.rank) {
        doc.setFont("helvetica", "normal");
        supText(
          doc,
          rankParts(s.rank, s.ranked_count),
          cell.x + cell.width / 2,
          midY + 1,
          7.9,
          "center",
        );
      }
    },
  });

  let y =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableTop;
  y += gapAfterTable;

  // the summary + conseil + signatures must fit below the table; otherwise use a new page
  if (y + summaryH + conseilH + gapBeforeSigns > SIGN_TOP + 1) {
    doc.addPage();
    y = 16;
  }

  // ———————————————————— Summary: moyenne · mention/rang · assiduité ————————————————————
  doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setLineWidth(0.55);
  doc.line(M, y, PAGE_W - M, y);
  const colW = [CONTENT_W * 0.36, CONTENT_W * 0.3, CONTENT_W * 0.34];
  const cx = [M + 0.5, M + colW[0] + 3.5, M + colW[0] + colW[1] + 3.5];
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.25);
  doc.line(cx[1] - 3.5, y + 3.5, cx[1] - 3.5, y + summaryH - 1);
  doc.line(cx[2] - 3.5, y + 3.5, cx[2] - 3.5, y + summaryH - 1);

  const kY = y + 5.4;
  const label = (t: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    setColor(doc, SLATE);
    spacedText(doc, t, x, yy, 0.3);
  };

  // moyenne générale
  label(isAnnual ? "MOYENNE ANNUELLE" : "MOYENNE GÉNÉRALE", cx[0], kY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  setColor(doc, INK);
  const big = fmtFr(shownGeneral);
  doc.text(big, cx[0], kY + 8.9);
  const bigW = doc.getTextWidth(big);
  doc.setFontSize(9.7);
  setColor(doc, SLATE);
  doc.text("/ 20", cx[0] + bigW + 1.5, kY + 8.9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  setColor(doc, INK);
  if (general) {
    doc.text(
      pdfSafe(`Classe : ${fmtFr(general.class_avg)} / 20 · Écart : ${fmtEcartFr(general.ecart)}`),
      cx[0],
      kY + 13.4,
    );
  }
  if (annualRows) {
    doc.setFontSize(7.2);
    setColor(doc, SLATE);
    const tri = data
      .annual!.trimesters.map((t) => `${t.periodLabel.replace("Trimestre ", "T")} : ${fmtFr(t.generalAverage)}`)
      .join(" · ");
    doc.text(pdfSafe(tri), cx[0], kY + (general ? 17.4 : 13.4));
  }

  // mention + rang
  label("MENTION", cx[1], kY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setColor(doc, INK);
  doc.text(pdfSafe(mention), cx[1], kY + 5.6);
  doc.setFontSize(8.2);
  if (general?.rank) {
    doc.setFont("helvetica", "normal");
    const lw = doc.getTextWidth("Rang : ");
    doc.text("Rang : ", cx[1], kY + 10.4);
    doc.setFont("helvetica", "bold");
    supText(doc, rankParts(general.rank, general.ranked_count), cx[1] + lw, kY + 10.4, 8.2);
  }
  if (isAnnual && data.annual && data.annual.passed !== null) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    const d = data.annual.complete
      ? data.annual.passed
        ? "Décision : Admis(e)"
        : "Décision : Ajourné(e)"
      : "Décision : provisoire";
    doc.text(pdfSafe(d), cx[1], kY + 14.6);
  }

  // assiduité
  label(isAnnual ? "ASSIDUITÉ (ANNÉE)" : "ASSIDUITÉ (PÉRIODE)", cx[2], kY);
  doc.setFontSize(8.2);
  setColor(doc, INK);
  const att = (count: number, text: string, yy: number) => {
    if (count > 0) {
      const num = String(count);
      doc.setFont("helvetica", "bold");
      doc.text(num, cx[2], yy);
      const w = doc.getTextWidth(num + " ");
      doc.setFont("helvetica", "normal");
      doc.text(pdfSafe(text.slice(num.length + 1)), cx[2] + w, yy);
    } else {
      doc.setFont("helvetica", "normal");
      doc.text(pdfSafe(text), cx[2], yy);
    }
  };
  const nAbs = stats.attendance?.absences ?? 0;
  const nLate = stats.attendance?.lates ?? 0;
  att(nAbs, absencesText(nAbs), kY + 5);
  att(nLate, latesText(nLate), kY + 9);

  y += summaryH;

  // ———————————————————— Appréciation du conseil de classe ————————————————————
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.25);
  doc.line(M, y, PAGE_W - M, y);
  label("APPRÉCIATION DU CONSEIL DE CLASSE", M + 0.5, y + 4.4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  setColor(doc, INK);
  doc.text(conseilLines, M + 0.5, y + 8.9, { lineHeightFactor: 1.3 });

  // ———————————————————— QR + single signature, anchored to the page bottom ————————————————————
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.25);
  doc.line(M, SIGN_TOP, PAGE_W - M, SIGN_TOP);

  if (data.verification) {
    const size = 18.5;
    const qy = 265.3;
    doc.addImage(data.verification.qrDataUrl, "PNG", M, qy, size, size);
    const tx = M + size + 2.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    setColor(doc, INK);
    spacedText(doc, "AUTHENTICITÉ", tx, qy + 6.8, 0.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    setColor(doc, [30, 41, 59]);
    doc.text("Scannez le QR ou saisissez le code :", tx, qy + 9.9);
    doc.setFont("helvetica", "bold");
    doc.text(pdfSafe(data.verification.code), tx, qy + 12.8);
    doc.setFont("helvetica", "normal");
    setColor(doc, MUTED);
    doc.text(
      pdfSafe(data.verification.url.replace(/^https?:\/\//, "").replace(/\?.*$/, "")),
      tx,
      qy + 15.6,
    );
  }

  const sigL = PAGE_W - M - 68;
  const sigC = sigL + 34;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  setColor(doc, SLATE);
  spacedText(doc, "LE CHEF D’ÉTABLISSEMENT", sigC, 261.4, 0.25, "center");
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(sigL, 281.3, PAGE_W - M, 281.3);
  doc.setFontSize(6);
  setColor(doc, MUTED);
  doc.text("Signature et cachet", sigC, 284, { align: "center" });

  // ———————————————————— Footer on every page ————————————————————
  const pages = doc.getNumberOfPages();
  const when = frenchToday(data.generatedAt ?? new Date());
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    setColor(doc, [71, 85, 105]);
    doc.text(pdfSafe(`Généré le ${when} — EduFaso`), M, FOOTER_Y);
    doc.text(`Page ${p} / ${pages}`, PAGE_W - M, FOOTER_Y, { align: "right" });
  }
  doc.setPage(pages);

  return doc;
}
