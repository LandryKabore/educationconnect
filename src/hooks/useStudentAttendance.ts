import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchAttendanceCounts } from "@/lib/scaleApi";
import type { AttendanceStatus } from "@/lib/types";

export const ATTENDANCE_PAGE = 120;

export type StudentPresenceRow = {
  id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  subject_id: string;
  matieres: { name: string } | null;
};

/**
 * One student's attendance: exact totals from SQL (all history, not the last 120 rows)
 * plus the list, loaded 120 rows at a time, newest first.
 */
export function useStudentAttendance(
  /** query-key root, kept equal to the old keys so realtime invalidation still works */
  keyRoot: "mes-presences" | "enfant-presences",
  studentId: string | undefined,
  enabled = true,
) {
  const on = !!studentId && enabled;

  const countsQ = useQuery({
    queryKey: [keyRoot, studentId, "counts"],
    enabled: on,
    queryFn: () => fetchAttendanceCounts(studentId!),
  });

  const listQ = useInfiniteQuery({
    queryKey: [keyRoot, studentId, "list"],
    enabled: on,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from("presences")
        .select("id, date, status, note, subject_id, matieres(name)")
        .eq("student_id", studentId!)
        .order("date", { ascending: false })
        .order("id")
        .range(pageParam, pageParam + ATTENDANCE_PAGE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as StudentPresenceRow[];
    },
    getNextPageParam: (last, all) =>
      last.length === ATTENDANCE_PAGE ? all.length * ATTENDANCE_PAGE : undefined,
  });

  const rows = useMemo(() => (listQ.data?.pages ?? []).flat(), [listQ.data]);

  return {
    counts: countsQ.data,
    rows,
    total: countsQ.data?.total ?? 0,
    isLoading: on && (countsQ.isLoading || listQ.isLoading),
    hasNextPage: !!listQ.hasNextPage,
    isFetchingNextPage: listQ.isFetchingNextPage,
    fetchNextPage: () => void listQ.fetchNextPage(),
  };
}
