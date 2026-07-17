import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Justifié",
};

const STATUS_TONE: Record<
  AttendanceStatus,
  "success" | "danger" | "warning" | "info"
> = {
  present: "success",
  absent: "danger",
  late: "warning",
  excused: "info",
};

export default function MesPresences() {
  const { user } = useAuth();

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["mes-presences", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presences")
        .select("*")
        .eq("student_id", user!.id)
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as {
        id: string;
        date: string;
        status: AttendanceStatus;
        note: string | null;
      }[];
    },
  });

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const a of attendance) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [attendance]);

  return (
    <div>
      <PageHeader
        title="Mes présences"
        subtitle="Historique des présences et absences"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : attendance.length === 0 ? (
        <EmptyState message="Aucune présence enregistrée pour le moment." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((status) => (
              <Card key={status} className="py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {STATUS_LABELS[status]}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {summary[status]}
                </p>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            {attendance.map((a) => (
              <Card
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {format(new Date(a.date), "EEEE d MMMM yyyy", {
                      locale: fr,
                    })}
                  </p>
                  {a.note ? (
                    <p className="mt-0.5 text-xs text-slate-500">{a.note}</p>
                  ) : null}
                </div>
                <Badge tone={STATUS_TONE[a.status]}>
                  {STATUS_LABELS[a.status]}
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
