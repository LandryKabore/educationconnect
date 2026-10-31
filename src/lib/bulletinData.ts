import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
  computeAnnualAverage,
} from "@/lib/averages";
import {
  generateBulletinPdf,
  type BulletinClassStats,
  type BulletinData,
} from "@/lib/pdfBulletin";
import { supabase } from "@/lib/supabase";
import type { GradeRow, Profile, School, Subject } from "@/lib/types";

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
 * For the annual bulletin, also loads the student's trimester notes for the decision footer.
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
    const { data: allGradesRaw, error } = await supabase
      .from("notes")
      .select("*, matieres(*)")
      .eq("student_id", student.id)
      .in("period_label", [...TRIMESTER_PERIODS]);
    if (error) throw error;

    const allGrades = (
      (allGradesRaw ?? []) as (GradeRow & { matieres: Subject })[]
    ).map((g) => ({ ...g, subject: g.matieres }));

    if (allGrades.length === 0 && !stats.general) {
      throw new Error("Aucune note sur l’année");
    }

    annual = computeAnnualAverage(allGrades, {
      coefficientBySubject: input.coefficientBySubject,
    });
  }

  return generateBulletinPdf({
    school,
    student,
    className: stats.class_name || className,
    periodLabel,
    stats,
    annual,
  });
}
