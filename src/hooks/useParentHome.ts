import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, subDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import { fetchMyChildrenSummary, type ChildSummary } from "@/lib/scaleApi";
import { useAttendancePeriods } from "@/hooks/useAttendancePeriods";
import { attendanceRate, type AttendanceTotals } from "@/lib/attendance";
import {
  computeAnnualAverage,
  programmeToCoefMap,
  type GradeWithSubject,
} from "@/lib/averages";
import {
  LOW_GRADE_ON_20,
  LOW_GRADE_WINDOW_DAYS,
  TODO_WINDOW_DAYS,
  buildAttendanceStrip,
  plural,
  scoreOn20,
  shortDateFr,
  type TodoItem,
} from "@/lib/parentHome";
import type { AttendanceStatus } from "@/lib/types";
import type { InboxPreview } from "@/components/PortalHomeKit";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * All the parent home data goes through the caller's own row-level security (the children
 * come from the existing ef_my_children_summary RPC, everything else is filtered by the
 * child ids that RPC returned).  Every query is keyed under "parent-home" so the realtime
 * hooks keep refreshing it.  No write, no new RPC, no migration.
 */

export function useParentChildren(userId: string | undefined) {
  return useQuery({
    queryKey: ["parent-home", "children", userId],
    enabled: !!userId,
    queryFn: () => fetchMyChildrenSummary(),
  });
}

/** Class id + birth date per child, in one query each. Failing is harmless (no age / no homework). */
export function useChildrenMeta(userId: string | undefined, childIds: string[]) {
  const key = childIds.join(",");
  return useQuery({
    queryKey: ["parent-home", "meta", userId, key],
    enabled: !!userId && childIds.length > 0,
    queryFn: async () => {
      const [{ data: links }, { data: enr }] = await Promise.all([
        supabase
          .from("liens_parent_eleve")
          .select("student_id, profils:profils!liens_parent_eleve_student_id_fkey(date_of_birth)")
          .eq("parent_id", userId!)
          .in("student_id", childIds),
        supabase
          .from("inscriptions")
          .select("student_id, class_section_id")
          .eq("status", "active")
          .in("student_id", childIds),
      ]);
      const dob: Record<string, string | null> = {};
      for (const l of (links ?? []) as unknown as {
        student_id: string;
        profils: { date_of_birth: string | null } | { date_of_birth: string | null }[] | null;
      }[]) {
        const p = Array.isArray(l.profils) ? l.profils[0] : l.profils;
        dob[l.student_id] = p?.date_of_birth ?? null;
      }
      const classId: Record<string, string> = {};
      for (const e of (enr ?? []) as { student_id: string; class_section_id: string }[]) {
        if (!classId[e.student_id]) classId[e.student_id] = e.class_section_id;
      }
      return { dob, classId };
    },
  });
}

export type ChildSnapshot = {
  /** T1/T2/T3 + yearly average — same formula as the Notes page « Moyenne annuelle » */
  average: {
    trimesters: { period: string; value: number | null }[];
    annual: number | null;
  } | null;
  attendance: {
    periodLabel: string;
    totals: AttendanceTotals;
    rate: number | null;
  } | null;
  /** unjustified absences over the last TODO_WINDOW_DAYS days (most recent first) */
  absences: { count: number; recent: { date: string; subject: string | null }[] };
};

/** Figures shown on the child switcher AND in the cards — one cached query per child. */
export function useChildSnapshot(childId: string, classSectionId: string | undefined) {
  const periods = useAttendancePeriods();
  const period = periods.find((p) => p.key === "trimester") ?? periods.find((p) => p.key === "year");
  const from = period?.from ?? null;
  const to = period?.to ?? null;

  return useQuery({
    queryKey: ["parent-home", "snapshot", childId, classSectionId ?? "", from, to],
    queryFn: async (): Promise<ChildSnapshot> => {
      const count = async (st?: AttendanceStatus) => {
        let q = supabase
          .from("presences")
          .select("id", { count: "exact", head: true })
          .eq("student_id", childId);
        if (from) q = q.gte("date", from);
        if (to) q = q.lte("date", to);
        if (st) q = q.eq("status", st);
        const { count: n, error } = await q;
        if (error) throw error;
        return n ?? 0;
      };

      const settle = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => {
        try {
          return await p;
        } catch {
          return fallback;
        }
      };

      const [gradesRes, coefRes, totals, absRes] = await Promise.all([
        supabase
          .from("notes")
          .select("*, matieres(*)")
          .eq("student_id", childId)
          .order("period_label"),
        classSectionId
          ? supabase
              .from("programme_classe")
              .select("subject_id, coefficient")
              .eq("class_section_id", classSectionId)
          : Promise.resolve({ data: [] as { subject_id: string; coefficient: number }[] }),
        settle(
          Promise.all([count(), count("absent"), count("late"), count("excused")]).then(
            ([total, absent, late, excused]): AttendanceTotals | null => ({
              total,
              present: Math.max(0, total - absent - late - excused),
              absent,
              late,
              excused,
            }),
          ),
          null,
        ),
        supabase
          .from("presences")
          .select("date, matieres(name)", { count: "exact" })
          .eq("student_id", childId)
          .eq("status", "absent")
          .gte("date", iso(subDays(new Date(), TODO_WINDOW_DAYS)))
          .order("date", { ascending: false })
          .limit(4),
      ]);

      // T1/T2/T3 + yearly average (same formula as the Notes page « Moyenne annuelle »)
      const grades = (gradesRes.data ?? []) as unknown as (GradeWithSubject & {
        period_label: string;
      })[];
      const coefs = programmeToCoefMap(
        ((coefRes as { data: { subject_id: string; coefficient: number }[] | null }).data ?? []),
      );
      const annualRes = computeAnnualAverage(grades, { coefficientBySubject: coefs });
      const average: ChildSnapshot["average"] =
        annualRes.trimesterCount > 0
          ? {
              trimesters: annualRes.trimesters.map((t) => ({
                period: t.periodLabel,
                value: t.generalAverage,
              })),
              annual: annualRes.annualAverage,
            }
          : null;

      const absRows = (absRes.data ?? []) as unknown as {
        date: string;
        matieres: { name: string } | { name: string }[] | null;
      }[];

      return {
        average,
        attendance:
          totals && period
            ? { periodLabel: period.label, totals, rate: attendanceRate(totals) }
            : null,
        absences: {
          count: absRes.count ?? absRows.length,
          recent: absRows.map((r) => ({
            date: r.date,
            subject: (Array.isArray(r.matieres) ? r.matieres[0] : r.matieres)?.name ?? null,
          })),
        },
      };
    },
  });
}

/** Last 28 days, one cell per school day. */
export function useAttendanceStrip(childId: string) {
  return useQuery({
    queryKey: ["parent-home", "strip", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presences")
        .select("date, status")
        .eq("student_id", childId)
        .gte("date", iso(subDays(new Date(), 27)))
        .lte("date", iso(new Date()))
        .limit(1000);
      if (error) throw error;
      return buildAttendanceStrip(
        (data ?? []) as { date: string; status: AttendanceStatus }[],
      );
    },
  });
}

export type WeekItem = {
  id: string;
  title: string;
  type: "devoir" | "examen";
  eval_date: string;
  start_time: string | null;
  subject: string | null;
};

/** Homework (« exercices ») and confirmed school exams of the child's class, next 7 days. */
export function useWeekHomework(childId: string, classSectionId: string | undefined) {
  return useQuery({
    queryKey: ["parent-home", "week", childId, classSectionId ?? ""],
    enabled: !!classSectionId,
    queryFn: async (): Promise<WeekItem[]> => {
      const today = new Date();
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, title, type, eval_date, start_time, matieres(name)")
        .eq("class_section_id", classSectionId!)
        .or("type.eq.devoir,and(type.eq.examen,admin_confirmed.eq.true)")
        .gte("eval_date", iso(today))
        .lte("eval_date", iso(addDays(today, 7)))
        .order("eval_date", { ascending: true })
        .limit(8);
      if (error) throw error;
      return ((data ?? []) as unknown as (Omit<WeekItem, "subject"> & {
        matieres: { name: string } | { name: string }[] | null;
      })[]).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        eval_date: r.eval_date,
        start_time: r.start_time,
        subject: (Array.isArray(r.matieres) ? r.matieres[0] : r.matieres)?.name ?? null,
      }));
    },
  });
}

/** Own inbox (recipient = me) — messages and announcements, newest first. */
export function useParentInbox(userId: string | undefined) {
  return useQuery({
    queryKey: ["parent-home", "inbox", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, subject, body, created_at, read_at, is_announcement, sender:profils!messages_sender_id_fkey(first_name, last_name)",
        )
        .eq("recipient_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const all = (data ?? []) as unknown as InboxPreview[];
      return {
        announcements: all.filter((m) => m.is_announcement).slice(0, 2),
        messages: all.filter((m) => !m.is_announcement).slice(0, 3),
      };
    },
  });
}

/** « À faire » items for one child, from data we already have (no new table). */
export function useChildTodos(
  childId: string,
  child: ChildSummary | undefined,
  snapshot: ChildSnapshot | undefined,
): TodoItem[] {
  return useMemo(() => {
    const items: TodoItem[] = [];
    const abs = snapshot?.absences;
    if (abs && abs.count > 0) {
      items.push({
        key: "absences",
        tone: "danger",
        text: `${abs.count} ${plural(abs.count, "absence non justifiée", "absences non justifiées")}`,
        detail:
          abs.recent
            .slice(0, 3)
            .map((a) => [a.subject, shortDateFr(a.date)].filter(Boolean).join(" "))
            .join(" · ") || undefined,
        to: `/enfants/${childId}/presences`,
        cta: "Voir",
      });
    }
    const cutoff = subDays(new Date(), LOW_GRADE_WINDOW_DAYS).getTime();
    const low = (child?.recentNotes ?? []).filter((n) => {
      if (n.is_absent) return false;
      const v = scoreOn20(n.score, n.max_score);
      return v !== null && v < LOW_GRADE_ON_20 && new Date(n.created_at).getTime() >= cutoff;
    });
    if (low.length > 0) {
      const n0 = low[0];
      const v0 = scoreOn20(n0.score, n0.max_score);
      items.push({
        key: "low-grades",
        tone: "warning",
        text:
          low.length > 1
            ? `${low.length} notes inférieures à ${LOW_GRADE_ON_20}/20`
            : `Note inférieure à ${LOW_GRADE_ON_20}/20`,
        detail: `${n0.subject ?? "Matière"} · ${v0 !== null ? v0.toFixed(1).replace(".", ",") : "—"}/20`,
        to: `/enfants/${childId}/notes`,
        cta: "Voir",
      });
    }
    return items;
  }, [childId, child, snapshot]);
}
