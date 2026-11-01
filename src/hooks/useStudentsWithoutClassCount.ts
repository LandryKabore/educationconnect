import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStudentsWithoutClass } from "@/lib/scaleApi";

/** Students in the school with no active class enrollment (counted by the database). */
export function useStudentsWithoutClassCount() {
  const { schoolId, role } = useAuth();
  const enabled = !!schoolId && role === "school_admin";

  return useQuery({
    queryKey: ["eleves-sans-classe", schoolId, "v5"],
    enabled,
    queryFn: async () => (await fetchStudentsWithoutClass(schoolId!, 0)).count,
    staleTime: 30_000,
  });
}
