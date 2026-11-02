import type { AnnualAverageResult } from "@/lib/averages";
import { supabase } from "@/lib/supabase";

type AnnualAverageRpc = {
  trimesters?: { period_label: string; general_average: number | null }[] | null;
  annual_average?: number | null;
  trimester_count?: number | null;
  complete?: boolean | null;
  passed?: boolean | null;
};

/**
 * Annual average computed by the database (same formula as the bulletin and the class ranking:
 * mean of the trimester general averages that have notes). One calculation for every screen.
 * Returns the same shape as the old client-side `computeAnnualAverage`.
 */
export async function fetchAnnualAverage(
  studentId: string,
  classSectionId: string,
): Promise<AnnualAverageResult> {
  const { data, error } = await supabase.rpc("ef_student_annual_average", {
    p_student_id: studentId,
    p_class_section_id: classSectionId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as AnnualAverageRpc;
  const trimesters = (raw.trimesters ?? []).map((t) => ({
    periodLabel: t.period_label,
    generalAverage: t.general_average === null ? null : Number(t.general_average),
  }));
  return {
    trimesters,
    annualAverage:
      raw.annual_average === null || raw.annual_average === undefined
        ? null
        : Number(raw.annual_average),
    trimesterCount: Number(raw.trimester_count ?? 0),
    complete: Boolean(raw.complete),
    passed: raw.passed === null || raw.passed === undefined ? null : Boolean(raw.passed),
  };
}
