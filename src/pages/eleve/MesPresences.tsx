import { useEffect, useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { useStudentAttendance, type StudentPresenceRow } from "@/hooks/useStudentAttendance";
import type { AttendanceStatus } from "@/lib/types";
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

export default function MesPresences() {
  const { user } = useAuth();
  const { markSeen } = usePresencePendingChanges();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const att = useStudentAttendance("mes-presences", user?.id);
  const attendance = att.rows;
  const isLoading = att.isLoading;

  // exact totals over the whole history (SQL), not just the rows shown below
  const summary: Record<AttendanceStatus, number> = {
    present: att.counts?.present ?? 0,
    absent: att.counts?.absent ?? 0,
    late: att.counts?.late ?? 0,
    excused: att.counts?.excused ?? 0,
  };
  const subjectCounts = useMemo(
    () => new Map((att.counts?.bySubject ?? []).map((x) => [x.subjectId ?? x.name, x])),
    [att.counts],
  );

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

  return (
    <div>
      <PageHeader
        title="Mes présences"
        subtitle="Par matière — les absences justifiées par l’école ne comptent pas comme absences"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : attendance.length === 0 ? (
        <EmptyState message="Aucune présence enregistrée pour le moment." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map(
              (status) => (
                <Card key={status} className="py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {STATUS_LABELS[status]}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {summary[status]}
                  </p>
                </Card>
              ),
            )}
          </div>

          <div className="space-y-8">
            {bySubject.map((group) => {
              const sc = subjectCounts.get(group.subjectId || group.subjectName);
              const counts: Record<AttendanceStatus, number> = {
                present: sc?.present ?? 0,
                absent: sc?.absent ?? 0,
                late: sc?.late ?? 0,
                excused: sc?.excused ?? 0,
              };
              return (
                <section key={group.subjectId}>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {group.subjectName}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {counts.present} présent
                      {counts.present !== 1 ? "s" : ""}
                      {" · "}
                      {counts.absent} absent
                      {counts.absent !== 1 ? "s" : ""}
                      {" · "}
                      {counts.late} retard
                      {counts.late !== 1 ? "s" : ""}
                      {counts.excused > 0
                        ? ` · ${counts.excused} justifié${counts.excused !== 1 ? "s" : ""}`
                        : ""}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((a) => (
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
                            <p className="mt-0.5 text-xs text-slate-500">
                              {a.note}
                            </p>
                          ) : null}
                        </div>
                        <Badge tone={STATUS_TONE[a.status]}>
                          {STATUS_LABELS[a.status]}
                        </Badge>
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
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
