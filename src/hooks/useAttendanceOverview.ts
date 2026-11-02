import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchAttendanceCounts } from "@/lib/scaleApi";
import type { AttendanceTotals } from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/types";

export const EXCEPTIONS_PAGE = 30;

export type AttendanceException = {
  id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  subject_id: string;
  matieres: { name: string } | null;
};

export type OverviewFilters = {
  from: string | null;
  to: string | null;
  subjectId: string;
  /** "" = all exceptions, otherwise one status */
  status: "" | "absent" | "late" | "excused";
};

/**
 * One student's attendance for the screens of the student and of the parent:
 * exact totals for the chosen period / subject (4 small count queries, no rows downloaded)
 * and ONLY the exceptions (absent / late / justified) as a list, 30 at a time.
 * Lessons where the student was present are summarised, never listed.
 * Everything goes through the caller's own RLS: nothing new is exposed.
 */
export function useAttendanceOverview(
  /** query-key root, kept equal to the old keys so realtime invalidation still works */
  keyRoot: "mes-presences" | "enfant-presences",
  studentId: string | undefined,
  filters: OverviewFilters,
  enabled = true,
) {
  const on = !!studentId && enabled;
  const { from, to, subjectId, status } = filters;

  const scoped = (q: ReturnType<typeof baseQuery>) => {
    let r = q;
    if (from) r = r.gte("date", from);
    if (to) r = r.lte("date", to);
    if (subjectId) r = r.eq("subject_id", subjectId);
    return r;
  };
  function baseQuery() {
    return supabase
      .from("presences")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId!);
  }

  const totalsQ = useQuery({
    queryKey: [keyRoot, studentId, "totals", from, to, subjectId],
    enabled: on,
    queryFn: async (): Promise<AttendanceTotals> => {
      const count = async (st?: AttendanceStatus) => {
        const q = scoped(baseQuery());
        const { count: n, error } = await (st ? q.eq("status", st) : q);
        if (error) throw error;
        return n ?? 0;
      };
      const [total, absent, late, excused] = await Promise.all([
        count(),
        count("absent"),
        count("late"),
        count("excused"),
      ]);
      return { total, absent, late, excused, present: Math.max(total - absent - late - excused, 0) };
    },
  });

  // subjects the student has attendance in (all history) for the filter
  const subjectsQ = useQuery({
    queryKey: [keyRoot, studentId, "subjects"],
    enabled: on,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const c = await fetchAttendanceCounts(studentId!);
      return (c.bySubject ?? [])
        .filter((s) => !!s.subjectId)
        .map((s) => ({ id: s.subjectId as string, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    },
  });

  const listQ = useInfiniteQuery({
    queryKey: [keyRoot, studentId, "exceptions", from, to, subjectId, status],
    enabled: on,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("presences")
        .select("id, date, status, note, subject_id, matieres(name)")
        .eq("student_id", studentId!)
        .neq("status", "present")
        .order("date", { ascending: false })
        .order("id")
        .range(pageParam, pageParam + EXCEPTIONS_PAGE - 1);
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      if (subjectId) q = q.eq("subject_id", subjectId);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceException[];
    },
    getNextPageParam: (last, all) =>
      last.length === EXCEPTIONS_PAGE ? all.length * EXCEPTIONS_PAGE : undefined,
  });

  const rows = useMemo(() => (listQ.data?.pages ?? []).flat(), [listQ.data]);

  return {
    totals: totalsQ.data,
    subjects: subjectsQ.data ?? [],
    rows,
    isLoading: on && totalsQ.isLoading,
    isListLoading: on && listQ.isLoading,
    isError: totalsQ.isError || listQ.isError,
    hasNextPage: !!listQ.hasNextPage,
    isFetchingNextPage: listQ.isFetchingNextPage,
    fetchNextPage: () => void listQ.fetchNextPage(),
  };
}
