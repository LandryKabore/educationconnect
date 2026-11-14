import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import { AttendanceBoard } from "@/components/AttendanceBoard";
import { EmptyState } from "@/components/ui";

export default function EnfantPresences() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { markSeen } = usePresencePendingChanges();

  useEffect(() => {
    if (id) markSeen(id);
  }, [id, markSeen]);

  const { data: link, isLoading } = useQuery({
    queryKey: ["parent-link", user?.id, id],
    enabled: !!user?.id && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("liens_parent_eleve")
        .select("*, profils:profils!liens_parent_eleve_student_id_fkey(*)")
        .eq("parent_id", user!.id)
        .eq("student_id", id!)
        .maybeSingle();
      return data;
    },
  });

  const child = (
    link as { profils?: { first_name: string; last_name: string } } | null
  )?.profils;

  if (!link && !isLoading) {
    return <EmptyState message="Accès non autorisé à cet élève." />;
  }

  return (
    <AttendanceBoard
      studentId={id}
      keyRoot="enfant-presences"
      audience="parent"
      enabled={!!link}
      title={child ? `Présences de ${fullName(child.first_name, child.last_name)}` : "Présences"}
      childFirstName={child?.first_name}
    />
  );
}
