import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fullName } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

/** Shared parent→child access gate used by all enfant-* pages. */
export function useParentChildLink(studentId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["parent-link", user?.id, studentId],
    enabled: !!user?.id && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liens_parent_eleve")
        .select("*, profils:profils!liens_parent_eleve_student_id_fkey(*)")
        .eq("parent_id", user!.id)
        .eq("student_id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        student_id: string;
        profils: {
          id: string;
          first_name: string;
          last_name: string;
          email?: string | null;
          matricule?: string | null;
        } | null;
      } | null;
    },
  });
}

export function useChildEnrollment(studentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["enfant-inscription", studentId],
    enabled: !!studentId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", studentId!)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as {
        class_section_id: string;
        classes: { name: string } | null;
      } | null;
    },
  });
}

export function childDisplayName(
  profils: { first_name: string; last_name: string } | null | undefined,
) {
  if (!profils) return null;
  return fullName(profils.first_name, profils.last_name);
}

export function useParentChildParams() {
  const { id } = useParams<{ id: string }>();
  return id;
}
