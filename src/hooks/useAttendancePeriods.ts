import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildAttendancePeriods,
  type CustomPeriod,
  type SchoolYearDates,
} from "@/lib/attendancePeriods";

/** Period choices (month / trimester / year / all) for the school year the caller can see. */
export function useAttendancePeriods() {
  const { data } = useQuery({
    queryKey: ["attendance-periods"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: year } = await supabase
        .from("annees_scolaires")
        .select("id, start_date, end_date")
        .eq("is_current", true)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!year) return { year: null as SchoolYearDates | null, custom: [] as CustomPeriod[] };
      const { data: custom } = await supabase
        .from("periodes_scolaires")
        .select("label, start_date, end_date")
        .eq("academic_year_id", year.id);
      return {
        year: { start_date: year.start_date, end_date: year.end_date } as SchoolYearDates,
        custom: (custom ?? []) as CustomPeriod[],
      };
    },
  });
  const today = new Date().toDateString();
  return useMemo(
    () => buildAttendancePeriods(new Date(), data?.year ?? null, data?.custom ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, today],
  );
}
