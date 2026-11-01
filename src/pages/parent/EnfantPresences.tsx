import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { supabase } from "@/lib/supabase";
import { useStudentAttendance, type StudentPresenceRow } from "@/hooks/useStudentAttendance";
import type { AttendanceStatus } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

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

type PresenceRow = StudentPresenceRow;

export default function EnfantPresences() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { markSeen } = usePresencePendingChanges();

  useEffect(() => {
    if (id) markSeen(id);
  }, [id, markSeen]);

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

  const child = (
    link as { profils?: { first_name: string; last_name: string } } | null
  )?.profils;

  const att = useStudentAttendance("enfant-presences", id, !!link);
  const attendance = att.rows;
  const isLoading = att.isLoading;

  const bySubject = useMemo(() => {
    const map = new Map<
      string,
      { subjectId: string; subjectName: string; rows: PresenceRow[] }
    >();
    for (const a of attendance) {
      const name = a.matieres?.name ?? "Matière";
      const key = a.subject_id || name;
      const cur = map.get(key) ?? {
        subjectId: a.subject_id,
        subjectName: name,
        rows: [],
      };
      cur.rows.push(a);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName, "fr"),
    );
  }, [attendance]);

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
        subtitle="Par matière"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : attendance.length === 0 ? (
        <EmptyState message="Aucune présence enregistrée." />
      ) : (
        <div className="space-y-8">
          {bySubject.map((group) => (
            <section key={group.subjectId}>
              <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {group.subjectName}
              </h2>
              <div className="space-y-2">
                {group.rows.map((a) => (
                  <Card
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="text-sm font-medium capitalize">
                      {format(new Date(a.date), "EEEE d MMMM yyyy", {
                        locale: fr,
                      })}
                    </span>
                    <Badge tone={STATUS_TONE[a.status]}>
                      {STATUS_LABELS[a.status]}
                    </Badge>
                  </Card>
                ))}
              </div>
            </section>
          ))}
          {att.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={att.isFetchingNextPage}
                onClick={att.fetchNextPage}
              >
                {att.isFetchingNextPage
                  ? "Chargement…"
                  : `Afficher plus (${Math.max(att.total - attendance.length, 0)} restantes)`}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
