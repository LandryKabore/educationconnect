import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignmentKindCreateLabel,
  assignmentKindCreatedToast,
  assignmentKindDueLabel,
  assignmentKindEmpty,
  assignmentKindLabel,
  formatExamSchedule,
  formatTimeHm,
  type AssignmentKind,
} from "@/lib/assignmentKinds";
import { ClassColorDot } from "@/components/ClassColor";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { Assignment, ClassSection, Subject } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
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

type Props = {
  kind: AssignmentKind;
};

type DevoirRow = Assignment & {
  classes: { name: string } | null;
  matieres: { name: string } | null;
};

export default function Devoirs({ kind }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isExam = kind === "examen";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClassId, setFilterClassId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["devoirs", user?.id, kind],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devoirs")
        .select("*, classes(name), matieres(name)")
        .eq("teacher_id", user!.id)
        .eq("kind", kind)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DevoirRow[];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["teacher-class-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("classes(*)")
        .eq("teacher_id", user!.id);
      const map = new Map<string, ClassSection>();
      for (const row of data ?? []) {
        const c = (row as unknown as { classes: ClassSection }).classes;
        if (c) map.set(c.id, c);
      }
      return sortClassesByProgression([...map.values()]);
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["teacher-subjects", user?.id, classId],
    enabled: !!user?.id && !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("matieres(*)")
        .eq("teacher_id", user!.id)
        .eq("class_section_id", classId);
      return (data ?? [])
        .map((r) => (r as unknown as { matieres: Subject }).matieres)
        .filter(Boolean);
    },
  });

  const filtered = useMemo(() => {
    if (!filterClassId) return assignments;
    return assignments.filter((a) => a.class_section_id === filterClassId);
  }, [assignments, filterClassId]);

  const resetForm = () => {
    setEditingId(null);
    setClassId("");
    setSubjectId("");
    setTitle("");
    setDescription("");
    setDueDate("");
    setStartTime("");
    setEndTime("");
    setShowForm(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setClassId(filterClassId || "");
    setSubjectId("");
    setTitle("");
    setDescription("");
    setDueDate("");
    setStartTime("");
    setEndTime("");
    setShowForm(true);
  };

  const openEdit = (a: DevoirRow) => {
    setEditingId(a.id);
    setClassId(a.class_section_id);
    setSubjectId(a.subject_id);
    setTitle(a.title);
    setDescription(a.description ?? "");
    setDueDate(a.due_date ?? "");
    setStartTime(formatTimeHm(a.start_time));
    setEndTime(formatTimeHm(a.end_time));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !classId || !subjectId) return;
    if (!title.trim()) {
      toast.error("Indiquez un titre");
      return;
    }
    if (isExam) {
      if (!dueDate) {
        toast.error("Indiquez la date de l’examen");
        return;
      }
      if (!startTime || !endTime) {
        toast.error("Indiquez le créneau horaire (début et fin)");
        return;
      }
      if (startTime >= endTime) {
        toast.error("L’heure de fin doit être après l’heure de début");
        return;
      }
    }

    setSaving(true);
    const existing = editingId
      ? assignments.find((a) => a.id === editingId)
      : null;

    const scheduleChanged =
      isExam &&
      existing &&
      (existing.due_date !== (dueDate || null) ||
        formatTimeHm(existing.start_time) !== startTime ||
        formatTimeHm(existing.end_time) !== endTime);

    const payload: Record<string, unknown> = {
      class_section_id: classId,
      subject_id: subjectId,
      teacher_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      kind,
      start_time: isExam ? startTime || null : null,
      end_time: isExam ? endTime || null : null,
    };

    if (isExam) {
      if (!editingId || scheduleChanged) {
        // New or rescheduled exams need admin confirmation again.
        payload.admin_confirmed = false;
        payload.confirmed_at = null;
        payload.confirmed_by = null;
      }
    }

    if (editingId) {
      const { error } = await supabase
        .from("devoirs")
        .update(payload)
        .eq("id", editingId)
        .eq("teacher_id", user.id);
      setSaving(false);
      if (error) {
        toast.error(error.message || "Modification impossible");
        return;
      }
      toast.success(
        isExam
          ? scheduleChanged
            ? "Examen modifié — en attente de confirmation admin"
            : "Examen modifié"
          : "Exercice modifié",
      );
    } else {
      const { error } = await supabase.from("devoirs").insert({
        ...payload,
        admin_confirmed: false,
      });
      setSaving(false);
      if (error) {
        toast.error(error.message || "Erreur lors de la création");
        return;
      }
      toast.success(
        isExam
          ? "Examen proposé — en attente de confirmation par l’administration"
          : assignmentKindCreatedToast(kind),
      );
    }

    resetForm();
    void qc.invalidateQueries({ queryKey: ["devoirs", user.id, kind] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
  };

  const handleDelete = async (a: DevoirRow) => {
    if (!user) return;
    const label = isExam ? "cet examen" : "cet exercice";
    if (!window.confirm(`Supprimer ${label} « ${a.title} » ?`)) return;
    setDeletingId(a.id);
    const { error } = await supabase
      .from("devoirs")
      .delete()
      .eq("id", a.id)
      .eq("teacher_id", user.id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success(isExam ? "Examen supprimé" : "Exercice supprimé");
    if (editingId === a.id) resetForm();
    void qc.invalidateQueries({ queryKey: ["devoirs", user.id, kind] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
  };

  return (
    <div>
      <PageHeader
        title={assignmentKindLabel(kind, true)}
        subtitle={
          isExam
            ? "Proposez un créneau — l’administration confirme la date"
            : "Travaux à faire à la maison"
        }
        actions={
          <Button
            type="button"
            onClick={() =>
              showForm && !editingId ? resetForm() : openCreate()
            }
          >
            {showForm && !editingId
              ? "Fermer"
              : assignmentKindCreateLabel(kind)}
          </Button>
        }
      />

      <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        {isExam
          ? "Indiquez la date et le créneau horaire. L’examen n’est officiel pour les élèves qu’après confirmation par l’administration. Pour noter, ouvrez la classe → Notes et créez une évaluation « Examen »."
          : "Indiquez ici les exercices à faire à la maison. Les élèves les consultent, mais ne rendent rien en ligne."}
      </p>

      <div className="mb-6 max-w-xs">
        <Label htmlFor="filter-classe">Filtrer par classe</Label>
        <Select
          id="filter-classe"
          value={filterClassId}
          onChange={(e) => setFilterClassId(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">
            {editingId
              ? isExam
                ? "Modifier l’examen"
                : "Modifier l’exercice"
              : assignmentKindCreateLabel(kind)}
          </h3>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <Label>Classe</Label>
              <Select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSubjectId("");
                }}
                required
              >
                <option value="">Choisir…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Matière</Label>
              <Select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                disabled={!classId}
              >
                <option value="">Choisir…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Titre</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>{assignmentKindDueLabel(kind)}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required={isExam}
              />
            </div>
            {isExam ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="exam-start">Heure de début</Label>
                  <Input
                    id="exam-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="exam-end">Heure de fin</Label>
                  <Input
                    id="exam-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Enregistrement…"
                  : editingId
                    ? "Enregistrer"
                    : isExam
                      ? "Proposer l’examen"
                      : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            filterClassId
              ? isExam
                ? "Aucun examen pour cette classe."
                : "Aucun exercice pour cette classe."
              : assignmentKindEmpty(kind)
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const schedule = formatExamSchedule({
              due_date: a.due_date,
              start_time: a.start_time,
              end_time: a.end_time,
            });
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {a.title}
                      </h3>
                      {isExam ? (
                        <Badge tone={a.admin_confirmed ? "success" : "warning"}>
                          {a.admin_confirmed
                            ? "Confirmé"
                            : "En attente admin"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      {a.classes?.name ? (
                        <>
                          <ClassColorDot
                            id={a.class_section_id}
                            name={a.classes.name}
                          />
                          {a.classes.name}
                        </>
                      ) : (
                        "Classe"
                      )}
                      <span>—</span>
                      <span>{a.matieres?.name ?? "Matière"}</span>
                    </p>
                    {a.description ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                        {a.description}
                      </p>
                    ) : null}
                    {a.due_date ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {isExam ? "Le " : "À rendre avant le "}
                        {formatDateSafe(a.due_date, "d MMMM yyyy", {
                          locale: fr,
                        })}
                        {schedule ? ` · ${schedule}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(a)}
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                      Modifier
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deletingId === a.id}
                      onClick={() => void handleDelete(a)}
                      title="Supprimer"
                      className="text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === a.id ? "…" : "Supprimer"}
                    </Button>
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

export function ExercicesMaisonPage() {
  return <Devoirs kind="exercice_maison" />;
}

export function ExamensPage() {
  return <Devoirs kind="examen" />;
}
