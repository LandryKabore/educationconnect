import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { supabase } from "@/lib/supabase";

/**
 * Composition sessions of the teacher's classes. Compositions are per class: on a class's
 * composition days its lessons are suspended (no roll call, no cahier, never late) and its
 * papers take their place in the timetable.
 */

export type TeacherCompositionPaper = {
  id: string;
  eval_date: string | null;
  start_time: string | null;
  end_time: string | null;
  subjectName: string;
};

export type TeacherCompositionSession = {
  id: string;
  classId: string;
  title: string | null;
  period_label: string | null;
  starts_on: string;
  ends_on: string;
  papers: TeacherCompositionPaper[];
};

/** classId → its sessions */
export type CompositionsByClass = Record<string, TeacherCompositionSession[]>;

export function useTeacherCompositions(classIds: string[], enabled = true) {
  const ids = [...new Set(classIds)].sort();
  return useQuery({
    queryKey: ["teacher-compositions", ids.join(",")],
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompositionsByClass> => {
      const { data: sessions, error } = await supabase
        .from("composition_sessions")
        .select("id, class_section_id, title, period_label, starts_on, ends_on")
        .in("class_section_id", ids)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      const rows = (sessions ?? []) as {
        id: string;
        class_section_id: string;
        title: string | null;
        period_label: string | null;
        starts_on: string;
        ends_on: string;
      }[];
      if (rows.length === 0) return {};
      const { data: papers, error: papersError } = await supabase
        .from("evaluations")
        .select("id, session_id, eval_date, start_time, end_time, matieres(name)")
        .in("session_id", rows.map((s) => s.id))
        .eq("type", "composition")
        .order("eval_date", { ascending: true });
      if (papersError) throw papersError;
      const bySession = new Map<string, TeacherCompositionPaper[]>();
      for (const p of (papers ?? []) as unknown as {
        id: string;
        session_id: string;
        eval_date: string | null;
        start_time: string | null;
        end_time: string | null;
        matieres: { name: string } | null;
      }[]) {
        const list = bySession.get(p.session_id) ?? [];
        list.push({ id: p.id, eval_date: p.eval_date, start_time: p.start_time, end_time: p.end_time, subjectName: p.matieres?.name ?? "Épreuve" });
        bySession.set(p.session_id, list);
      }
      const out: CompositionsByClass = {};
      for (const s of rows) {
        (out[s.class_section_id] ??= []).push({
          id: s.id,
          classId: s.class_section_id,
          title: s.title,
          period_label: s.period_label,
          starts_on: s.starts_on.slice(0, 10),
          ends_on: s.ends_on.slice(0, 10),
          papers: bySession.get(s.id) ?? [],
        });
      }
      return out;
    },
  });
}

/** The session a class is sitting on that day, if any. */
export function compositionOn(classId: string | null | undefined, date: string, byClass: CompositionsByClass | undefined) {
  if (!classId || !byClass) return null;
  return (byClass[classId] ?? []).find((s) => date >= s.starts_on && date <= s.ends_on) ?? null;
}

/** Per class: the session running today, or the next one starting within `withinDays`. */
export function currentCompositions(byClass: CompositionsByClass | undefined, today: string, withinDays = 7) {
  if (!byClass) return [];
  const limit = format(addDays(new Date(`${today}T12:00:00`), withinDays), "yyyy-MM-dd");
  const out: TeacherCompositionSession[] = [];
  for (const sessions of Object.values(byClass)) {
    const running = sessions.find((s) => today >= s.starts_on && today <= s.ends_on);
    const soon = sessions.filter((s) => s.starts_on > today && s.starts_on <= limit).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
    const pick = running ?? soon;
    if (pick) out.push(pick);
  }
  return out.sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/** Date (yyyy-MM-dd) of a weekday 1…6 in the week of `base` (Monday first). */
export function dateInWeek(base: Date, dow: number) {
  return format(addDays(startOfWeek(base, { weekStartsOn: 1 }), dow - 1), "yyyy-MM-dd");
}
