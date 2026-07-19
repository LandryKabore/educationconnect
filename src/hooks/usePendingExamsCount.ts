import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export const pendingExamsQueryKey = (schoolId: string) =>
  ["examens-en-attente", schoolId] as const;

/** Exam proposals awaiting school-admin confirmation. */
export function usePendingExamsCount() {
  const { schoolId, role } = useAuth();
  const enabled = !!schoolId && role === "school_admin";

  return useQuery({
    queryKey: pendingExamsQueryKey(schoolId ?? ""),
    enabled,
    queryFn: async () => {
      const { data: classes, error: classError } = await supabase
        .from("classes")
        .select("id")
        .eq("school_id", schoolId!);
      if (classError) throw classError;
      const classIds = (classes ?? []).map((c) => c.id as string);
      if (classIds.length === 0) return 0;

      const { count, error } = await supabase
        .from("devoirs")
        .select("id", { count: "exact", head: true })
        .eq("kind", "examen")
        .eq("admin_confirmed", false)
        .in("class_section_id", classIds);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000,
  });
}
