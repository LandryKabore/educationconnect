import { ANNUAL_PERIOD_LABEL } from "@/lib/averages";
import { fetchAnnualAverage } from "@/lib/annualAverage";
import {
  documentVerifyUrl,
  issueBulletinCode,
  qrPngDataUrl,
} from "@/lib/documents";
import {
  generateBulletinPdf,
  type BulletinClassStats,
  type BulletinData,
} from "@/lib/pdfBulletin";
import { supabase } from "@/lib/supabase";
import type { Profile, School } from "@/lib/types";

export type BulletinFetchInput = {
  school: School;
  student: Profile;
  classSectionId: string;
  className: string;
  periodLabel: string;
  coefficientBySubject?: Record<string, number>;
};

async function fetchClassStats(
  studentId: string,
  classSectionId: string,
  periodLabel: string,
): Promise<BulletinClassStats> {
  const { data, error } = await supabase.rpc("ef_bulletin_class_stats", {
    p_student_id: studentId,
    p_class_section_id: classSectionId,
    p_period_label: periodLabel,
  });
  if (error) throw error;

  const raw = (data ?? {}) as Partial<BulletinClassStats>;
  return {
    class_name: raw.class_name ?? null,
    year_label: raw.year_label ?? null,
    class_size: Number(raw.class_size ?? 0),
    period_label: raw.period_label ?? periodLabel,
    is_annual: Boolean(raw.is_annual),
    subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    general: raw.general ?? null,
    attendance: {
      absences: Number(raw.attendance?.absences ?? 0),
      lates: Number(raw.attendance?.lates ?? 0),
    },
  };
}

/**
 * Fetch anonymized class stats + build PDF.
 * For the annual bulletin, also loads the annual average (database) for the decision footer.
 * Registers the document and prints a QR code that opens the public verification page.
 */
export async function buildBulletinPdf(
  input: BulletinFetchInput,
): Promise<ReturnType<typeof generateBulletinPdf>> {
  const { school, student, classSectionId, className, periodLabel } = input;

  const stats = await fetchClassStats(
    student.id,
    classSectionId,
    periodLabel,
  );

  if (
    periodLabel !== ANNUAL_PERIOD_LABEL &&
    stats.subjects.length === 0 &&
    !stats.general
  ) {
    throw new Error("Aucune note pour cette période");
  }

  let annual: BulletinData["annual"] = null;
  if (periodLabel === ANNUAL_PERIOD_LABEL) {
    // Same formula as the class ranking: computed once, in the database.
    annual = await fetchAnnualAverage(student.id, classSectionId);
    if (annual.trimesters.every((t) => t.generalAverage === null) && !stats.general) {
      throw new Error("Aucune note sur l’année");
    }
  }

  // Register the document and get its public code (QR code); skipped if the register is not installed.
  let verification: BulletinData["verification"] = null;
  const code = await issueBulletinCode(student.id, classSectionId, periodLabel);
  if (code) {
    const url = documentVerifyUrl(code);
    verification = { code, url, qrDataUrl: await qrPngDataUrl(url) };
  }

  return generateBulletinPdf({
    school,
    student,
    className: stats.class_name || className,
    periodLabel,
    stats,
    annual,
    verification,
  });
}
