import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { DevoirListItem } from "@/components/DevoirsClearList";
import { supabase } from "@/lib/supabase";

/**
 * « Exercices de maison » come from two places:
 *   - exercises created as evaluations (type `devoir`, can be graded if the teacher wants);
 *   - the « travail à faire » written in a lesson's cahier de textes (never graded).
 * This turns the lesson homework into list items of the same shape, so students, parents and
 * teachers see one single list, sorted by due date. Nothing is copied in the database.
 */

export type LessonHomeworkRow = {
  id: string;
  class_section_id: string;
  subject_id: string;
  teacher_id: string;
  creneau_id: string | null;
  entry_date: string;
  homework: string;
  homework_due: string | null;
  matieres: { name: string } | null;
};

/** Ids of lesson homework items start with this, so screens can tell them apart. */
export const LESSON_HOMEWORK_PREFIX = "cahier-";

export const isLessonHomework = (id: string) => id.startsWith(LESSON_HOMEWORK_PREFIX);

const SHORT = 90;

export function lessonHomeworkToItem(row: LessonHomeworkRow): DevoirListItem {
  const text = row.homework.trim();
  const short = text.length > SHORT ? `${text.slice(0, SHORT - 1).trimEnd()}…` : text;
  const given = format(new Date(`${row.entry_date}T12:00:00`), "EEEE d MMMM", { locale: fr });
  return {
    id: `${LESSON_HOMEWORK_PREFIX}${row.id}`,
    class_section_id: row.class_section_id,
    subject_id: row.subject_id,
    teacher_id: row.teacher_id,
    period_label: "",
    type: "devoir",
    title: short,
    description: `${text.length > SHORT ? `${text}\n` : ""}Donné en cours le ${given}`,
    max_score: 0,
    eval_date: row.homework_due,
    start_time: null,
    end_time: null,
    admin_confirmed: true,
    confirmed_at: null,
    confirmed_by: null,
    session_id: null,
    created_at: row.entry_date,
    matieres: row.matieres,
  };
}

/** Homework written in the lessons of one class (most recent 200). */
export async function fetchLessonHomework(classSectionId: string): Promise<DevoirListItem[]> {
  const { data, error } = await supabase
    .from("cahier_entrees")
    .select("id, class_section_id, subject_id, teacher_id, creneau_id, entry_date, homework, homework_due, matieres(name)")
    .eq("class_section_id", classSectionId)
    .not("homework", "is", null)
    .order("entry_date", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as LessonHomeworkRow[])
    .filter((r) => r.homework?.trim())
    .map(lessonHomeworkToItem);
}

/** Exercises first by due date (no date last), like the evaluation list. */
export function sortByDue(items: DevoirListItem[]) {
  return [...items].sort((a, b) => (a.eval_date ?? "9999").localeCompare(b.eval_date ?? "9999"));
}
