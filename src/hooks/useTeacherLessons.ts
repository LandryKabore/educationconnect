import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { timeToMinutes } from "@/lib/timetableConflicts";

/**
 * The teacher's day is made of LESSONS: one timetable slot (class + subject + hours) on one date.
 * Each lesson has two jobs:
 *   1. the roll call  (presences rows for class + subject + date)
 *   2. the cahier de textes (an entry for that slot and date)
 * A lesson is complete when both are done. Jobs not done once the lesson is over are LATE;
 * late jobs are kept for the last LATE_DAYS days so the teacher can catch up.
 */

export const LATE_DAYS = 7;

export type TeacherSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  class_section_id: string;
  subject_id: string;
  matieres: { name: string } | null;
  classes: { name: string } | null;
};

export type JobState = "done" | "partial" | "todo";
export type LessonTiming = "upcoming" | "live" | "over";

export type Lesson = {
  key: string;
  slotId: string;
  date: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  start: string;
  end: string;
  room: string | null;
  timing: LessonTiming;
  studentCount: number;
  /** roll call */
  appel: JobState;
  recorded: number;
  absent: number;
  late: number;
  /** cahier de textes */
  cahier: JobState;
  cahierEntryId: string | null;
  /** jobs that should be done by now (roll call once started, cahier once over) */
  appelDue: boolean;
  cahierDue: boolean;
};

export const iso = (d: Date) => format(d, "yyyy-MM-dd");
const hhmm = (t: string) => t.slice(0, 5);

/** Monday = 1 … Saturday = 6; Sunday has no lessons. */
function dayNumber(d: Date) {
  return d.getDay();
}

export function lessonPath(l: Pick<Lesson, "slotId" | "date">, tab?: "appel" | "cahier" | "travail") {
  return `/cours/${l.slotId}?date=${l.date}${tab ? `&onglet=${tab}` : ""}`;
}

export function lessonHours(l: Pick<Lesson, "start" | "end">) {
  return `${hhmm(l.start)} – ${hhmm(l.end)}`;
}

/** Supabase returns at most 1 000 rows per request: read in pages. */
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The teacher's weekly timetable. */
export function useTeacherSlots(enabled = true) {
  const { user, schoolId } = useAuth();
  return useQuery({
    queryKey: ["teacher-slots", user?.id, schoolId],
    enabled: enabled && !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("id, day_of_week, start_time, end_time, room, class_section_id, subject_id, matieres(name), classes(name)")
        .eq("teacher_id", user!.id)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as TeacherSlot[];
    },
  });
}

/**
 * Lessons from LATE_DAYS days ago to today, with the state of each job.
 * `now` is passed in so the page can re-render the timing every minute.
 */
export function useTeacherLessons(now: Date, enabled = true) {
  const { user } = useAuth();
  const slotsQ = useTeacherSlots(enabled);
  const slots = useMemo(() => slotsQ.data ?? [], [slotsQ.data]);
  const today = iso(now);
  const from = iso(addDays(now, -LATE_DAYS));
  const classIds = [...new Set(slots.map((s) => s.class_section_id))].sort();

  const statusQ = useQuery({
    queryKey: ["teacher-lessons", user?.id, from, today, classIds.join(",")],
    enabled: enabled && !!user?.id && slotsQ.isSuccess,
    queryFn: async () => {
      if (classIds.length === 0) {
        return { students: {} as Record<string, number>, presences: [], entries: [] };
      }
      const [enrolments, presences, entries] = await Promise.all([
        readAll<{ class_section_id: string }>((a, b) =>
          supabase
            .from("inscriptions")
            .select("class_section_id")
            .in("class_section_id", classIds)
            .eq("status", "active")
            .range(a, b),
        ),
        readAll<{ class_section_id: string; subject_id: string; date: string; status: string }>((a, b) =>
          supabase
            .from("presences")
            .select("class_section_id, subject_id, date, status")
            .in("class_section_id", classIds)
            .gte("date", from)
            .lte("date", today)
            .range(a, b),
        ),
        readAll<{ id: string; creneau_id: string | null; class_section_id: string; subject_id: string; entry_date: string }>(
          (a, b) =>
            supabase
              .from("cahier_entrees")
              .select("id, creneau_id, class_section_id, subject_id, entry_date")
              .eq("teacher_id", user!.id)
              .gte("entry_date", from)
              .lte("entry_date", today)
              .range(a, b),
        ),
      ]);
      const students: Record<string, number> = {};
      for (const e of enrolments) students[e.class_section_id] = (students[e.class_section_id] ?? 0) + 1;
      return { students, presences, entries };
    },
  });

  const lessons = useMemo((): Lesson[] => {
    const st = statusQ.data;
    if (!st) return [];
    const roll = new Map<string, { recorded: number; absent: number; late: number }>();
    for (const p of st.presences) {
      const k = `${p.class_section_id}|${p.subject_id}|${p.date}`;
      const r = roll.get(k) ?? { recorded: 0, absent: 0, late: 0 };
      r.recorded += 1;
      if (p.status === "absent") r.absent += 1;
      if (p.status === "late") r.late += 1;
      roll.set(k, r);
    }
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const out: Lesson[] = [];
    for (let i = LATE_DAYS; i >= 0; i--) {
      const d = addDays(now, -i);
      const dow = dayNumber(d);
      if (dow === 0) continue;
      const date = iso(d);
      for (const s of slots.filter((x) => x.day_of_week === dow)) {
        const timing: LessonTiming =
          date < today
            ? "over"
            : nowMin >= timeToMinutes(s.end_time)
              ? "over"
              : nowMin >= timeToMinutes(s.start_time)
                ? "live"
                : "upcoming";
        const r = roll.get(`${s.class_section_id}|${s.subject_id}|${date}`) ?? { recorded: 0, absent: 0, late: 0 };
        const studentCount = st.students[s.class_section_id] ?? 0;
        const appel: JobState =
          studentCount > 0 && r.recorded >= studentCount ? "done" : r.recorded > 0 ? "partial" : "todo";
        const entry =
          st.entries.find((e) => e.creneau_id === s.id && e.entry_date === date) ??
          st.entries.find(
            (e) => !e.creneau_id && e.class_section_id === s.class_section_id && e.subject_id === s.subject_id && e.entry_date === date,
          );
        out.push({
          key: `${s.id}|${date}`,
          slotId: s.id,
          date,
          classId: s.class_section_id,
          className: s.classes?.name ?? "Classe",
          subjectId: s.subject_id,
          subjectName: s.matieres?.name ?? "Cours",
          start: s.start_time,
          end: s.end_time,
          room: s.room,
          timing,
          studentCount,
          appel,
          recorded: r.recorded,
          absent: r.absent,
          late: r.late,
          cahier: entry ? "done" : "todo",
          cahierEntryId: entry?.id ?? null,
          appelDue: timing !== "upcoming" && studentCount > 0,
          cahierDue: timing === "over",
        });
      }
    }
    return out;
  }, [statusQ.data, slots, now, today]);

  const todayLessons = lessons.filter((l) => l.date === today).sort((a, b) => a.start.localeCompare(b.start));
  const lateLessons = lessons
    .filter((l) => (l.appelDue && l.appel !== "done") || (l.cahierDue && l.cahier !== "done"))
    .filter((l) => l.date < today || l.timing === "over")
    .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));

  /** The next day (after today) that has lessons, for « no class today » days. */
  const nextDay = useMemo(() => {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(now, i);
      const dow = dayNumber(d);
      if (dow === 0) continue;
      const daySlots = slots.filter((s) => s.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (daySlots.length) return { date: iso(d), first: daySlots[0]!, count: daySlots.length };
    }
    return null;
  }, [slots, now]);

  return {
    isLoading: slotsQ.isLoading || statusQ.isLoading,
    isError: slotsQ.isError || statusQ.isError,
    hasTimetable: slots.length > 0,
    slots,
    lessons,
    todayLessons,
    lateLessons,
    nextDay,
  };
}
