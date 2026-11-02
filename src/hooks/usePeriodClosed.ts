import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * True when the school has closed this period for the class's school year (grades are locked).
 * The database enforces the lock; this only lets the screen warn before saving.
 */
export function usePeriodClosed(classSectionId: string | undefined, periodLabel: string | undefined) {
  const { data } = useQuery({
    queryKey: ["period-closed", classSectionId, periodLabel],
    enabled: !!classSectionId && !!periodLabel,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ef_period_is_closed", {
        p_class_section_id: classSectionId!,
        p_label: periodLabel!,
      });
      if (error) return false; // never block the screen because of this check
      return data === true;
    },
  });
  return data === true;
}
