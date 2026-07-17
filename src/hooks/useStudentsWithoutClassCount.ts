import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

/** Students in the school with no active class enrollment. */
export function useStudentsWithoutClassCount() {
  const { schoolId, role } = useAuth();
  const enabled = !!schoolId && role === "school_admin";

  return useQuery({
    queryKey: ["eleves-sans-classe", schoolId],
    enabled,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      if (error) throw error;
      const ids = (roles ?? []).map((r) => r.user_id as string);
      if (ids.length === 0) return 0;

      const { data: enrollments, error: enrErr } = await supabase
        .from("inscriptions")
        .select("student_id")
        .eq("status", "active")
        .in("student_id", ids);
      if (enrErr) throw enrErr;

      const enrolled = new Set(
        (enrollments ?? []).map((e) => e.student_id as string),
      );
      return ids.filter((id) => !enrolled.has(id)).length;
    },
    staleTime: 30_000,
  });
}
