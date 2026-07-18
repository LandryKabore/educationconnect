import { supabase } from "@/lib/supabase";

const IN_CHUNK = 50;

/**
 * Count programme rows per class for a school.
 * Uses chunked `.in(class_section_id)` — nested embeds can return empty under RLS
 * without throwing, which made the UI show 0/45 even when data existed.
 */
export async function fetchProgrammeCountsByClass(
  schoolId: string,
): Promise<Record<string, number>> {
  const { data: schoolClasses, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("school_id", schoolId);
  if (classError) throw classError;

  const ids = (schoolClasses ?? []).map((c) => c.id as string);
  if (ids.length === 0) return {};

  const counts: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("programme_classe")
      .select("class_section_id")
      .in("class_section_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = row.class_section_id as string;
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

/** Active enrollments for a school, keyed by student_id. */
export async function fetchEnrollmentsByStudent(
  schoolId: string,
): Promise<Map<string, { id: string; name: string }>> {
  const { data: schoolClasses, error: classError } = await supabase
    .from("classes")
    .select("id, name")
    .eq("school_id", schoolId);
  if (classError) throw classError;

  const classes = (schoolClasses ?? []) as { id: string; name: string }[];
  if (classes.length === 0) return new Map();

  const nameById = new Map(classes.map((c) => [c.id, c.name ?? "Classe"]));
  const ids = classes.map((c) => c.id);
  const map = new Map<string, { id: string; name: string }>();

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("inscriptions")
      .select("student_id, class_section_id")
      .eq("status", "active")
      .in("class_section_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const classId = row.class_section_id as string;
      map.set(row.student_id as string, {
        id: classId,
        name: nameById.get(classId) ?? "Classe",
      });
    }
  }
  return map;
}

/** PostgREST `.in()` with hundreds of UUIDs can fail silently — chunk requests. */
export async function fetchByIdChunks<T extends Record<string, unknown>>(
  table: string,
  column: string,
  ids: string[],
  select: string,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, chunk);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}
