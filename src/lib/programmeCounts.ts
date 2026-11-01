import { fetchProgrammeCounts } from "@/lib/scaleApi";

/**
 * Count programme rows per class for a school.
 * Done by the database (one call) — the old version downloaded every programme
 * row and was silently cut at 1,000 rows in schools with many classes.
 */
export async function fetchProgrammeCountsByClass(
  schoolId: string,
): Promise<Record<string, number>> {
  return fetchProgrammeCounts(schoolId);
}
