import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Justifié",
};

const STATUS_TONE: Record<AttendanceStatus, "success" | "danger" | "warning" | "info"> = {
  present: "success",
  absent: "danger",
  late: "warning",
  excused: "info",
};

export default function EnfantPresences() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: link } = useQuery({
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

  const child = (link as { profils?: { first_name: string; last_name: string } } | null)?.profils;

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["enfant-presences", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presences")
        .select("*")
        .eq("student_id", id!)
        .order("date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as { id: string; date: string; status: AttendanceStatus; note: string | null }[];
    },
  });

  if (!link && !isLoading) {
    return <EmptyState message="Accès non autorisé à cet élève." />;
  }

  return (
    <div>
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
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : attendance.length === 0 ? (
        <EmptyState message="Aucune présence enregistrée." />
      ) : (
        <div className="space-y-2">
          {attendance.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium">
                {format(new Date(a.date), "EEEE d MMMM yyyy", { locale: fr })}
              </span>
              <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
