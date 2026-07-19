import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatExamSchedule,
} from "@/lib/assignmentKinds";
import { ClassColorDot } from "@/components/ClassColor";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { Assignment, ClassSection } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { fullName } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

type ExamRow = Assignment & {
  classes: { id: string; name: string } | null;
  matieres: { name: string } | null;
  teacher: { first_name: string; last_name: string } | null;
};

export default function ExamensEcole() {
  const { schoolId, user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "confirmed" | "all">(
    "pending",
  );
  const [classId, setClassId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["ecole-examens", schoolId, filter, classId],
    enabled: !!schoolId && classIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("devoirs")
        .select(
          "*, classes(id, name), matieres(name), teacher:profils!devoirs_teacher_id_fkey(first_name, last_name)",
        )
        .eq("kind", "examen")
        .in("class_section_id", classId ? [classId] : classIds)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (filter === "pending") q = q.eq("admin_confirmed", false);
      if (filter === "confirmed") q = q.eq("admin_confirmed", true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ExamRow[];
    },
  });

  const setConfirmed = async (exam: ExamRow, confirmed: boolean) => {
    if (!user) return;
    setBusyId(exam.id);
    const { error } = await supabase
      .from("devoirs")
      .update({
        admin_confirmed: confirmed,
        confirmed_at: confirmed ? new Date().toISOString() : null,
        confirmed_by: confirmed ? user.id : null,
      })
      .eq("id", exam.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message || "Mise à jour impossible");
      return;
    }
    toast.success(
      confirmed
        ? "Examen confirmé — visible pour les élèves"
        : "Confirmation retirée",
    );
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["devoirs"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
  };

  const pendingCount = exams.filter((e) => !e.admin_confirmed).length;

  return (
    <div>
      <PageHeader
        title="Examens"
        subtitle="Confirmez les dates et créneaux proposés par les enseignants"
      />

      <div className="mb-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="exam-filter">Statut</Label>
          <Select
            id="exam-filter"
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "pending" | "confirmed" | "all")
            }
          >
            <option value="pending">En attente de confirmation</option>
            <option value="confirmed">Confirmés</option>
            <option value="all">Tous</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="exam-classe">Classe</Label>
          <Select
            id="exam-classe"
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

      {filter === "pending" && !isLoading ? (
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          {pendingCount} examen{pendingCount > 1 ? "s" : ""} en attente.
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : exams.length === 0 ? (
        <EmptyState
          message={
            filter === "pending"
              ? "Aucun examen en attente de confirmation."
              : "Aucun examen pour cette sélection."
          }
        />
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const schedule = formatExamSchedule({
              due_date: exam.due_date,
              start_time: exam.start_time,
              end_time: exam.end_time,
            });
            const teacherName = exam.teacher
              ? fullName(exam.teacher.first_name, exam.teacher.last_name)
              : "Enseignant";
            return (
              <Card key={exam.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {exam.title}
                      </h3>
                      <Badge
                        tone={exam.admin_confirmed ? "success" : "warning"}
                      >
                        {exam.admin_confirmed
                          ? "Confirmé"
                          : "À confirmer"}
                      </Badge>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                      {exam.classes ? (
                        <>
                          <ClassColorDot
                            id={exam.classes.id}
                            name={exam.classes.name}
                          />
                          {exam.classes.name}
                        </>
                      ) : (
                        "Classe"
                      )}
                      <span>·</span>
                      <span>{exam.matieres?.name ?? "Matière"}</span>
                      <span>·</span>
                      <span>{teacherName}</span>
                    </p>
                    {exam.description ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {exam.description}
                      </p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                      <Clock className="h-4 w-4 shrink-0 opacity-70" />
                      {exam.due_date
                        ? formatDateSafe(exam.due_date, "EEEE d MMMM yyyy", {
                            locale: fr,
                          })
                        : "Date non définie"}
                      {schedule ? ` · ${schedule}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {exam.admin_confirmed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === exam.id}
                        onClick={() => void setConfirmed(exam, false)}
                      >
                        Retirer la confirmation
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === exam.id || !exam.due_date}
                        onClick={() => void setConfirmed(exam, true)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {busyId === exam.id ? "…" : "Confirmer la date"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
