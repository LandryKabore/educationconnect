import type { Profile, School } from "@/lib/types";
import {
  ANNUAL_PERIOD_LABEL,
  PASSING_AVERAGE,
  formatAverage,
  formatPassDecision,
  type AnnualAverageResult,
} from "@/lib/averages";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

function fmt(n: number | null | undefined, digits = 2): string {
  return formatAverage(n ?? null, digits);
}

function fmtEcart(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function periodTitle(periodLabel: string): string {
  if (periodLabel === ANNUAL_PERIOD_LABEL) {
    return "Bulletin annuel";
  }
  if (periodLabel === "Trimestre 1") return "Bulletin du 1er Trimestre";
  if (periodLabel === "Trimestre 2") return "Bulletin du 2e Trimestre";
  if (periodLabel === "Trimestre 3") return "Bulletin du 3e Trimestre";
  return `Bulletin — ${periodLabel}`;
}

export function generateBulletinPdf(data: BulletinData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const studentName = [data.student.last_name, data.student.first_name]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const stats = data.stats;
  const isAnnual = data.periodLabel === ANNUAL_PERIOD_LABEL || stats.is_annual;
  const className = stats.class_name || data.className || "—";
  const yearLabel = stats.year_label || "—";
  const general = stats.general;
  const mention = bulletinMention(general?.student_avg);

  // —— Header ——
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.rect(12, 10, pageW - 24, 34);

  doc.setFontSize(11);
  doc.setTextColor(15, 118, 110);
  doc.setFont("helvetica", "bold");
  doc.text(data.school.name || "École", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (data.school.city) doc.text(data.school.city, 14, 23);

  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(`Année scolaire : ${yearLabel}`, 14, 30);
  doc.text(`Classe : ${className}`, 14, 35);
  doc.text(
    `${stats.class_size} élève${stats.class_size !== 1 ? "s" : ""}`,
    14,
    40,
  );

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(periodTitle(data.periodLabel), pageW / 2, 20, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(studentName || "ÉLÈVE", pageW - 14, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (data.student.matricule) {
    doc.text(`Matricule : ${data.student.matricule}`, pageW - 14, 26, {
      align: "right",
    });
  }
  if (general) {
    doc.text(
      `Rang : ${general.rank} / ${general.ranked_count}`,
      pageW - 14,
      32,
      { align: "right" },
    );
  }

  let y = 50;

  // Classic subject table — Écart replaces Appréciations (always filled)
  const body =
    stats.subjects.length > 0
      ? stats.subjects.map((s) => [
          s.teacher_name
            ? `${s.subject_name}\n${s.teacher_name}`
            : s.subject_name,
          String(s.coefficient),
          fmt(s.student_avg),
          fmt(s.class_avg),
          fmt(s.class_min),
          fmt(s.class_max),
          fmtEcart(s.ecart),
        ])
      : [["Aucune moyenne", "—", "—", "—", "—", "—", "—"]];

  autoTable(doc, {
    startY: y,
    head: [["Matières", "Coef.", "Élève", "Clas.", "Min", "Max", "Écart"]],
    body,
    styles: { fontSize: 8, cellPadding: 1.6, valign: "middle" },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: "bold",halign: "left" },
      1: { cellWidth: 14,halign: "center" },
      2: { cellWidth: 18,halign: "center" },
      3: { cellWidth: 18,halign: "center" },
      4: { cellWidth: 18,halign: "center" },
      5: { cellWidth: 18,halign: "center" },
      6: { cellWidth: 22,halign: "center", fontStyle: "bold" },
    },
    didParseCell: (hook) => {
      if (hook.section !== "body" || hook.column.index !== 6) return;
      const raw = String(hook.cell.raw ?? "");
      if (raw.startsWith("+")) {
        hook.cell.styles.textColor = [21, 128, 61];
      } else if (raw.startsWith("-") || raw.startsWith("−")) {
        hook.cell.styles.textColor = [185, 28, 28];
      }
    },
    margin: { left: 12, right: 12 },
    theme: "grid",
  });

  y =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y;
  y += 4;

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Écart = moyenne élève − moyenne de classe (remplace les appréciations textuelles).",
    14,
    y,
  );
  y += 8;

  if (isAnnual && (data.annual?.trimesters?.length ?? 0) > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Période", "Moyenne élève /20"]],
      body: data.annual!.trimesters.map((t) => [
        t.periodLabel,
        fmt(t.generalAverage),
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: 255,
        fontStyle: "bold",
      },
      margin: { left: 12, right: 12 },
    });
    y =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y;
    y += 8;
  }

  // —— Moyennes générales ——
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(12, y, pageW - 24, 22);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 118, 110);
  doc.text("Moyennes générales", 14, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  const gStudent = general?.student_avg ?? data.annual?.annualAverage ?? null;
  doc.text(`Élève : ${fmt(gStudent)} / 20`, 14, y + 13);
  doc.text(`Classe : ${fmt(general?.class_avg)} / 20`, 70, y + 13);
  doc.text(`Écart : ${fmtEcart(general?.ecart)}`, 130, y + 13);

  if (general) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Rang général : ${general.rank} / ${general.ranked_count}  ·  Min ${fmt(general.class_min)}  ·  Max ${fmt(general.class_max)}`,
      14,
      y + 19,
    );
  }

  y += 28;

  // —— Absences / Retards ——
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Absences : ${stats.attendance?.absences ?? 0} jour${(stats.attendance?.absences ?? 0) !== 1 ? "s" : ""}  —  Retards : ${stats.attendance?.lates ?? 0}`,
    14,
    y,
  );
  y += 8;

  // —— Mention (auto) ——
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Mention : ${mention}`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "(attribuée automatiquement selon la moyenne générale)",
    14,
    y + 4,
  );
  y += 12;

  if (isAnnual && data.annual) {
    doc.setFontSize(10);
    doc.setTextColor(
      data.annual.passed ? 21 : 185,
      data.annual.passed ? 128 : 28,
      data.annual.passed ? 61 : 28,
    );
    doc.setFont("helvetica", "bold");
    doc.text(
      `Décision : ${formatPassDecision(data.annual)}${data.annual.complete ? "" : " (provisoire)"}`,
      14,
      y,
    );
    doc.setFont("helvetica", "normal");
    y += 8;
  }

  // —— Authenticity QR code (left of the signature) ——
  if (data.verification) {
    const size = 24;
    let qrY = Math.max(y - 4, 244);
    if (qrY + size > 284) {
      doc.addPage();
      qrY = 20;
    }
    doc.addImage(data.verification.qrDataUrl, "PNG", 14, qrY, size, size);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("Vérifier l’authenticité", 14 + size + 4, qrY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text("Scannez le QR code ou ouvrez :", 14 + size + 4, qrY + 11);
    doc.text(data.verification.url.replace(/\?.*$/, ""), 14 + size + 4, qrY + 15);
    doc.text(`Code : ${data.verification.code}`, 14 + size + 4, qrY + 19);
  }

  // —— Signature ——
  y = Math.max(y, 250);
  doc.setDrawColor(148, 163, 184);
  doc.line(pageW - 80, y, pageW - 14, y);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Le chef d’établissement", pageW - 14, y + 5, {
    align: "right",
  });

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Généré le ${new Date().toLocaleDateString("fr-FR")} — EduFaso`,
    14,
    287,
  );

  return doc;
}
