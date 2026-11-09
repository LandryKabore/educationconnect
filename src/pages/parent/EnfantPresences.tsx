import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import { AttendanceOverview } from "@/components/AttendanceOverview";
import { ParentChildSwitcher } from "@/components/ParentChildSwitcher";
import { EmptyState, PageHeader } from "@/components/ui";

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
    <div className="mx-auto max-w-2xl">
      <Link
        to="/enfants"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux enfants
      </Link>

      <PageHeader
        title={
          child
            ? `Présences — ${fullName(child.first_name, child.last_name)}`
            : "Présences"
        }
        subtitle="Taux de présence, absences et retards"
        belowTitle={<ParentChildSwitcher />}
      />

      <AttendanceOverview
        keyRoot="enfant-presences"
        studentId={id}
        enabled={!!link}
        audience="parent"
      />
    </div>
  );
}
