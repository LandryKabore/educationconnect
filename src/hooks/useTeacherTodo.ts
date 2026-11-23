import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { iso, useTeacherLessons, type Lesson } from "@/hooks/useTeacherLessons";
import { supabase } from "@/lib/supabase";
import type { EvaluationType } from "@/lib/types";

/** How far back ungraded evaluations are listed. */
const GRADING_DAYS = 45;

export type UngradedEvaluation = {
  id: string;
  title: string;
  type: EvaluationType;
  evalDate: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  missing: number;
  studentCount: number;
};

export type PendingExam = {
  id: string;
  title: string;
  evalDate: string | null;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

/**
 * Everything the teacher still has to do, in one list:
 * late roll calls and cahier entries (last 7 days), past quizzes / exams without all grades,
 * exams waiting for the school's confirmation, and unread messages.
 */
export function useTeacherTodo(now: Date, enabled = true) {
  const { user } = useAuth();
  const lessons = useTeacherLessons(now, enabled);
  const { data: unread = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const today = iso(now);
  const since = iso(addDays(now, -GRADING_DAYS));

  const evalQ = useQuery({
    queryKey: ["teacher-todo", user?.id, since, today],
    enabled: enabled && !!user?.id,
    queryFn: async () => {
      const { data: evals, error } = await supabase
        .from("evaluations")
        .select("id, title, type, eval_date, admin_confirmed, class_section_id, subject_id, classes(name), matieres(name)")
        .eq("teacher_id", user!.id)
        .in("type", ["interrogation", "examen"])
        .or(`eval_date.gte.${since},eval_date.is.null`)
        .order("eval_date", { ascending: false });
      if (error) throw error;
      type Row = {
        id: string;
        title: string;
        type: EvaluationType;
        eval_date: string | null;
        admin_confirmed: boolean | null;
        class_section_id: string;
        subject_id: string;
        classes: { name: string } | null;
        matieres: { name: string } | null;
      };
      const rows = (evals ?? []) as unknown as Row[];
      const pending: PendingExam[] = rows
        .filter((r) => r.type === "examen" && !r.admin_confirmed && (!r.eval_date || r.eval_date >= today))
        .map((r) => ({
          id: r.id,
          title: r.title,
          evalDate: r.eval_date,
          classId: r.class_section_id,
          className: r.classes?.name ?? "Classe",
          subjectId: r.subject_id,
          subjectName: r.matieres?.name ?? "Matière",
        }));
      // past evaluations that count: quizzes, and exams once confirmed
      const past = rows.filter(
        (r) => r.eval_date && r.eval_date <= today && (r.type === "interrogation" || r.admin_confirmed),
      );
      if (past.length === 0) return { ungraded: [] as UngradedEvaluation[], pending };

      const classIds = [...new Set(past.map((r) => r.class_section_id))];
      const ids = past.map((r) => r.id);
      const [{ data: enrol }, notes] = await Promise.all([
        supabase.from("inscriptions").select("class_section_id").in("class_section_id", classIds).eq("status", "active").limit(5000),
        (async () => {
          const out: { evaluation_id: string }[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error: e } = await supabase
              .from("notes")
              .select("evaluation_id")
              .in("evaluation_id", ids)
              .range(from, from + 999);
            if (e) throw e;
            out.push(...((data ?? []) as { evaluation_id: string }[]));
            if (!data || data.length < 1000) break;
          }
          return out;
        })(),
      ]);
      const students: Record<string, number> = {};
      for (const e of (enrol ?? []) as { class_section_id: string }[]) {
        students[e.class_section_id] = (students[e.class_section_id] ?? 0) + 1;
      }
      const graded: Record<string, number> = {};
      for (const n of notes) graded[n.evaluation_id] = (graded[n.evaluation_id] ?? 0) + 1;
      const ungraded = past
        .map((r) => {
          const studentCount = students[r.class_section_id] ?? 0;
          return {
            id: r.id,
            title: r.title,
            type: r.type,
            evalDate: r.eval_date!,
            classId: r.class_section_id,
            className: r.classes?.name ?? "Classe",
            subjectId: r.subject_id,
            subjectName: r.matieres?.name ?? "Matière",
            studentCount,
            missing: Math.max(0, studentCount - (graded[r.id] ?? 0)),
          };
        })
        .filter((r) => r.missing > 0 && r.studentCount > 0);
      return { ungraded, pending };
    },
  });

  const late = lessons.lateLessons;
  const lateAppels = late.filter((l: Lesson) => l.appelDue && l.appel !== "done");
  const lateCahiers = late.filter((l: Lesson) => l.cahierDue && l.cahier !== "done");
  const ungraded = evalQ.data?.ungraded ?? [];
  const pendingExams = evalQ.data?.pending ?? [];

  const count = useMemo(
    () => lateAppels.length + lateCahiers.length + ungraded.length,
    [lateAppels.length, lateCahiers.length, ungraded.length],
  );

  return {
    isLoading: lessons.isLoading || evalQ.isLoading,
    lessons,
    lateAppels,
    lateCahiers,
    ungraded,
    pendingExams,
    unreadMessages: unread.discussions,
    /** items that need the teacher (pending exams and messages are shown, not counted) */
    count,
  };
}
