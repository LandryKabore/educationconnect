import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_TONE,
} from "@/lib/attendance";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, ClassSection } from "@/lib/types";
import { cn, joinProfile } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

type PresenceRow = {
  id: string;
  class_section_id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  profils: { first_name: string; last_name: string } | null;
  classes: { id: string; name: string } | null;
  matieres: { name: string } | null;
};

export default function PresencesEcole() {
  const { schoolId, user } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [classId, setClassId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justifyNote, setJustifyNote] = useState<Record<string, string>>({});

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return sortClassesByProgression((data ?? []) as ClassSection[]);
    },
  });

  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ecole-presences", schoolId, date, classId],
    enabled: !!schoolId && classIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("presences")
        .select(
          "id, class_section_id, student_id, date, status, note, profils:profils!presences_student_id_fkey(first_name, last_name), classes:classes!presences_class_section_id_fkey(id, name), matieres(name)",
        )
        .eq("date", date)
        .in("class_section_id", classId ? [classId] : classIds)
        .order("class_section_id");

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PresenceRow[];
    },
  });

  const absences = rows.filter((r) => r.status === "absent");
  const justified = rows.filter((r) => r.status === "excused");
  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const r of rows) counts[r.status] += 1;
    return counts;
  }, [rows]);

  const setStatus = async (
    row: PresenceRow,
    status: AttendanceStatus,
    note: string | null,
  ) => {
    if (!user) return;
    setBusyId(row.id);
    const { error } = await supabase
      .from("presences")
      .update({
        status,
        note,
        recorded_by: user.id,
      })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message || "Mise à jour impossible");
      return;
    }
    toast.success(
      status === "excused"
        ? "Absence justifiée — elle ne compte plus comme absence"
        : "Justification retirée",
    );
    void qc.invalidateQueries({ queryKey: ["ecole-presences"] });
    void qc.invalidateQueries({ queryKey: ["presences"] });
    void qc.invalidateQueries({ queryKey: ["mes-presences"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["eleve-presences"] });
  };

  return (
    <div>
      <PageHeader
        title="Présences"
        subtitle="Consultez l’appel et justifiez les absences (elles ne compteront plus comme absences)"
      />

      <div className="mb-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {formatDateSafe(date, "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div>
          <Label htmlFor="classe">Classe</Label>
          <Select
            id="classe"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[]).map((st) => (
          <Card key={st} className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {ATTENDANCE_LABELS[st]}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary[st]}
            </p>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classIds.length === 0 ? (
        <EmptyState message="Aucune classe dans l’école." />
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-rose-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Absences à justifier
              </h2>
              <Badge tone="danger">{absences.length}</Badge>
            </div>
            {absences.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">
                  Aucune absence non justifiée pour cette date
                  {classId ? " / classe" : ""}.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {absences.map((row) => (
                  <Card key={row.id} className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          <PersonName
                            first={joinProfile(row.profils)?.first_name}
                            last={joinProfile(row.profils)?.last_name}
                          />
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                          {row.classes ? (
                            <>
                              <ClassColorDot
                                id={row.classes.id}
                                name={row.classes.name}
                              />
                              {row.classes.name}
                            </>
                          ) : (
                            "Classe"
                          )}
                          {row.matieres?.name
                            ? ` · ${row.matieres.name}`
                            : ""}
                        </p>
                      </div>
                      <Badge tone="danger">Absent</Badge>
                    </div>
                    <div>
                      <Label htmlFor={`note-${row.id}`}>
                        Motif de justification (facultatif)
                      </Label>
                      <Textarea
                        id={`note-${row.id}`}
                        rows={2}
                        placeholder="Ex. : certificat médical, rendez-vous…"
                        value={justifyNote[row.id] ?? ""}
                        onChange={(e) =>
                          setJustifyNote((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() =>
                        void setStatus(
                          row,
                          "excused",
                          (justifyNote[row.id] ?? "").trim() ||
                            "Justifié par l’administration",
                        )
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {busyId === row.id ? "…" : "Justifier l’absence"}
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-sky-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Absences déjà justifiées
              </h2>
              <Badge tone="info">{justified.length}</Badge>
            </div>
            {justified.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">
                  Aucune absence justifiée pour cette sélection.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {justified.map((row) => (
                  <Card
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        <PersonName
                          first={joinProfile(row.profils)?.first_name}
                          last={joinProfile(row.profils)?.last_name}
                        />
                      </p>
                      <p className="text-sm text-slate-500">
                        {row.classes?.name ?? "Classe"}
                        {row.matieres?.name ? ` · ${row.matieres.name}` : ""}
                        {row.note ? ` · ${row.note}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">Justifié</Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() => void setStatus(row, "absent", null)}
                      >
                        Retirer
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Appel du jour
            </h2>
            {rows.length === 0 ? (
              <EmptyState message="Aucun appel enregistré pour cette date." />
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    data-class-color
                    style={classColorVars({
                      id: row.classes?.id,
                      name: row.classes?.name,
                    })}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                      CLASS_COLOR_SURFACE,
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        <PersonName
                          first={joinProfile(row.profils)?.first_name}
                          last={joinProfile(row.profils)?.last_name}
                        />
                      </p>
                      <p className="text-xs opacity-80">
                        {row.classes?.name ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={ATTENDANCE_TONE[row.status]}>
                        {ATTENDANCE_LABELS[row.status]}
                      </Badge>
                      {row.class_section_id ? (
                        <Link
                          to={`/classes/${row.class_section_id}/presences`}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          Classe →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
