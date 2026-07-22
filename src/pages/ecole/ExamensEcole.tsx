import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { ClassColorDot } from "@/components/ClassColor";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import { Modal } from "@/components/Modal";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Evaluation, Profile, Subject } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { fullName, joinProfile } from "@/lib/utils";
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
  TimeInput24,
} from "@/components/ui";

function currentPeriodLabel(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 9) return "Trimestre 1";
  if (month <= 3) return "Trimestre 2";
  return "Trimestre 3";
}

/** Created already confirmed (admin) — not a teacher proposal that was later approved. */
function wasCreatedConfirmed(exam: {
  admin_confirmed: boolean;
  confirmed_at: string | null;
  created_at: string;
}): boolean {
  if (!exam.admin_confirmed || !exam.confirmed_at) return false;
  const confirmed = new Date(exam.confirmed_at).getTime();
  const created = new Date(exam.created_at).getTime();
  if (Number.isNaN(confirmed) || Number.isNaN(created)) return false;
  return Math.abs(confirmed - created) < 10_000;
}

type ExamRow = Evaluation & {
  classes: { id: string; name: string } | null;
  matieres: { name: string } | null;
  teacher: { first_name: string; last_name: string } | null;
};

export default function ExamensEcole() {
  const { schoolId, user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "confirmed" | "all">(
    "all",
  );
  const [classId, setClassId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [examClassId, setExamClassId] = useState("");
  const [examSubjectId, setExamSubjectId] = useState("");
  const [examTeacherId, setExamTeacherId] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examDueDate, setExamDueDate] = useState("");
  const [examStartTime, setExamStartTime] = useState("08:00");
  const [examEndTime, setExamEndTime] = useState("10:00");
  const [examSaving, setExamSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExamRow | null>(null);

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

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId && showForm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["enseignants-profils", schoolId],
    enabled: !!schoolId && showForm,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "teacher")
        .eq("active", true);
      return (roles ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["affectations", schoolId, "v2"],
    enabled: !!schoolId && showForm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select(
          "id, affectations_enseignement(teacher_id, class_section_id, subject_id)",
        )
        .eq("school_id", schoolId!);
      if (error) throw error;
      const rows: {
        teacher_id: string;
        class_section_id: string;
        subject_id: string;
      }[] = [];
      for (const cls of data ?? []) {
        const affs = (
          cls as {
            affectations_enseignement?: {
              teacher_id: string;
              class_section_id: string;
              subject_id: string;
            }[] | null;
          }
        ).affectations_enseignement;
        if (!Array.isArray(affs)) continue;
        for (const a of affs) rows.push(a);
      }
      return rows;
    },
  });

  const examTeachers = useMemo(() => {
    if (!examClassId) return teachers;
    const ids = new Set(
      assignments
        .filter((a) => a.class_section_id === examClassId)
        .map((a) => a.teacher_id),
    );
    if (examTeacherId) ids.add(examTeacherId);
    if (ids.size === 0) return teachers;
    return teachers.filter((t) => ids.has(t.id));
  }, [teachers, assignments, examClassId, examTeacherId]);

  const examSubjects = useMemo(() => {
    if (!examTeacherId || !examClassId) return [];
    const subjectIds = new Set(
      assignments
        .filter(
          (a) =>
            a.teacher_id === examTeacherId &&
            a.class_section_id === examClassId,
        )
        .map((a) => a.subject_id),
    );
    if (examSubjectId) subjectIds.add(examSubjectId);
    return subjects
      .filter((s) => subjectIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [assignments, examTeacherId, examClassId, subjects, examSubjectId]);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["ecole-examens", schoolId, filter, classId],
    enabled: !!schoolId && classIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("evaluations")
        .select(
          "*, classes(id, name), matieres(name), teacher:profils!evaluations_teacher_id_fkey(first_name, last_name)",
        )
        .eq("type", "examen")
        .in("class_section_id", classId ? [classId] : classIds)
        .order("eval_date", { ascending: true, nullsFirst: false });

      if (filter === "pending") q = q.eq("admin_confirmed", false);
      if (filter === "confirmed") q = q.eq("admin_confirmed", true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ExamRow[];
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setExamClassId("");
    setExamSubjectId("");
    setExamTeacherId("");
    setExamTitle("");
    setExamDescription("");
    setExamDueDate("");
    setExamStartTime("08:00");
    setExamEndTime("10:00");
  };

  const openCreate = () => {
    setExamClassId(classId || classes[0]?.id || "");
    setExamSubjectId("");
    setExamTeacherId("");
    setExamTitle("");
    setExamDescription("");
    setExamDueDate("");
    setExamStartTime("08:00");
    setExamEndTime("10:00");
    setShowForm(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !examClassId) return;
    if (!examTeacherId || !examSubjectId) {
      toast.error("Choisissez l’enseignant et la matière");
      return;
    }
    if (!examTitle.trim()) {
      toast.error("Indiquez un titre");
      return;
    }
    if (!examDueDate) {
      toast.error("Indiquez la date du devoir");
      return;
    }
    if (!examStartTime || !examEndTime) {
      toast.error("Indiquez le créneau horaire (début et fin)");
      return;
    }
    if (examStartTime >= examEndTime) {
      toast.error("L’heure de fin doit être après l’heure de début");
      return;
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from("evaluations")
      .select("id, title, start_time, end_time, matieres(name)")
      .eq("type", "examen")
      .eq("class_section_id", examClassId)
      .eq("eval_date", examDueDate)
      .limit(1);
    if (conflictError) {
      toast.error(conflictError.message || "Vérification impossible");
      return;
    }
    const conflict = conflicts?.[0] as unknown as
      | {
          title: string;
          matieres: { name: string } | null;
          start_time: string | null;
          end_time: string | null;
        }
      | undefined;
    if (conflict) {
      const subject = conflict.matieres?.name ?? "Matière";
      const slot = formatExamSchedule({
        due_date: examDueDate,
        start_time: conflict.start_time,
        end_time: conflict.end_time,
      });
      toast.error(
        `Un devoir est déjà prévu ce jour pour cette classe (${subject}${
          slot ? ` · ${slot}` : ""
        }). Choisissez une autre date.`,
      );
      return;
    }

    setExamSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("evaluations").insert({
      class_section_id: examClassId,
      subject_id: examSubjectId,
      teacher_id: examTeacherId,
      period_label: currentPeriodLabel(),
      title: examTitle.trim(),
      description: examDescription.trim() || null,
      eval_date: examDueDate,
      type: "examen",
      start_time: examStartTime,
      end_time: examEndTime,
      admin_confirmed: true,
      confirmed_at: now,
      confirmed_by: user.id,
    });
    setExamSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error(
          "Un devoir est déjà prévu ce jour pour cette classe. Choisissez une autre date.",
        );
        return;
      }
      toast.error(error.message || "Création impossible");
      return;
    }

    toast.success("Devoir créé et confirmé — visible pour les élèves");
    resetForm();
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
  };

  const setConfirmed = async (exam: ExamRow, confirmed: boolean) => {
    if (!user) return;
    setBusyId(exam.id);
    const { error } = await supabase
      .from("evaluations")
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
        ? "Devoir confirmé — visible pour les élèves"
        : "Confirmation retirée — le devoir n’est plus visible pour les élèves",
    );
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
  };

  const deleteExam = async (exam: ExamRow) => {
    setBusyId(exam.id);
    const { error } = await supabase.from("evaluations").delete().eq("id", exam.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success("Devoir supprimé");
    setPendingDelete(null);
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
  };

  const pendingCount = exams.filter((e) => !e.admin_confirmed).length;

  const examGroups = useMemo(() => {
    const sortKey = (e: ExamRow) => {
      const date = e.eval_date ?? "9999-99-99";
      const time = (e.start_time ?? "99:99").slice(0, 5);
      return `${date}T${time}`;
    };

    const byClass = new Map<string, ExamRow[]>();
    for (const exam of exams) {
      const id = exam.class_section_id || exam.classes?.id || "_";
      const list = byClass.get(id) ?? [];
      list.push(exam);
      byClass.set(id, list);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    }

    const knownIds = classes.map((c) => c.id).filter((id) => byClass.has(id));
    const orphanIds = [...byClass.keys()].filter((id) => !knownIds.includes(id));

    return [...knownIds, ...orphanIds].map((id) => {
      const rows = byClass.get(id)!;
      return {
        classId: id,
        className:
          rows[0]?.classes?.name ??
          classes.find((c) => c.id === id)?.name ??
          "Classe",
        exams: rows,
      };
    });
  }, [exams, classes]);

  return (
    <div>
      <ConfirmPasswordDialog
        open={!!pendingDelete}
        title={
          pendingDelete
            ? `Supprimer « ${pendingDelete.title} » ?`
            : "Confirmer"
        }
        description="Ce devoir et les notes associées seront définitivement retirés. Saisissez votre mot de passe administrateur pour confirmer."
        confirmLabel="Supprimer le devoir"
        onCancel={() => setPendingDelete(null)}
        onVerified={async () => {
          if (pendingDelete) await deleteExam(pendingDelete);
        }}
      />
      <PageHeader
        title="Devoirs"
        subtitle="Créez un devoir pour une classe, ou confirmez ceux proposés par les enseignants"
        actions={
          <Button type="button" onClick={openCreate} disabled={classes.length === 0}>
            <Plus className="h-4 w-4" />
            Créer un devoir
          </Button>
        }
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
            <option value="all">Tous</option>
            <option value="pending">En attente de confirmation</option>
            <option value="confirmed">Confirmés</option>
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
          {pendingCount} devoir{pendingCount > 1 ? "s" : ""} en attente.
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : exams.length === 0 ? (
        <EmptyState
          message={
            filter === "pending"
              ? "Aucun devoir en attente de confirmation."
              : "Aucun devoir pour cette sélection."
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {examGroups.map((group) => (
            <section
              key={group.classId}
              className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <h2 className="mb-3 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <ClassColorDot id={group.classId} name={group.className} />
                {group.className}
                <span className="text-sm font-normal text-slate-500">
                  {group.exams.length} devoir
                  {group.exams.length > 1 ? "s" : ""}
                </span>
              </h2>
              <div className="space-y-3">
                {group.exams.map((exam) => {
                  const schedule = formatExamSchedule({
                    due_date: exam.eval_date,
                    start_time: exam.start_time,
                    end_time: exam.end_time,
                  });
                  const teacherName = exam.teacher
                    ? fullName(
                        exam.teacher.first_name,
                        exam.teacher.last_name,
                      )
                    : "Enseignant";
                  const className =
                    exam.classes?.name ?? group.className ?? "Classe";
                  const subjectName = exam.matieres?.name ?? "Matière";
                  return (
                    <Card key={exam.id} className="h-full">
                      <div className="flex h-full flex-col gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                              {className}
                              <span className="font-normal text-slate-400">
                                {" "}
                                ·{" "}
                              </span>
                              {subjectName}
                            </h3>
                            <Badge
                              tone={
                                exam.admin_confirmed ? "success" : "warning"
                              }
                            >
                              {exam.admin_confirmed
                                ? "Confirmé"
                                : "À confirmer"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {exam.title}
                            <span className="text-slate-400"> · </span>
                            <span className="text-slate-500">{teacherName}</span>
                          </p>
                          {exam.description ? (
                            <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
                              {exam.description}
                            </p>
                          ) : null}
                          <p className="mt-2 flex items-start gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                            <span>
                              {exam.eval_date
                                ? formatDateSafe(
                                    exam.eval_date,
                                    "EEE d MMM yyyy",
                                    { locale: fr },
                                  )
                                : "Date non définie"}
                              {schedule ? (
                                <>
                                  <br />
                                  {schedule}
                                </>
                              ) : null}
                            </span>
                          </p>
                        </div>
                        <div className="mt-auto space-y-2">
                          {!exam.admin_confirmed ? (
                            <Button
                              type="button"
                              size="sm"
                              className="w-full"
                              disabled={
                                busyId === exam.id || !exam.eval_date
                              }
                              onClick={() => void setConfirmed(exam, true)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {busyId === exam.id
                                ? "…"
                                : "Confirmer la date"}
                            </Button>
                          ) : wasCreatedConfirmed(exam) ? null : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={busyId === exam.id}
                              onClick={() => void setConfirmed(exam, false)}
                            >
                              Retirer la confirmation
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            disabled={busyId === exam.id}
                            onClick={() => setPendingDelete(exam)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm ? (
        <Modal
          open={showForm}
          title="Créer un devoir"
          onClose={resetForm}
          closeDisabled={examSaving}
        >
          <form
            onSubmit={(e) => void handleSaveExam(e)}
            className="space-y-4"
          >
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              Un seul devoir par classe et par jour. Le devoir créé ici est
              confirmé immédiatement et visible pour les élèves.
            </p>
            <div>
              <Label>Classe</Label>
              <Select
                value={examClassId}
                onChange={(e) => {
                  setExamClassId(e.target.value);
                  setExamTeacherId("");
                  setExamSubjectId("");
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
              <Label>Enseignant</Label>
              <Select
                value={examTeacherId}
                onChange={(e) => {
                  setExamTeacherId(e.target.value);
                  setExamSubjectId("");
                }}
                required
                disabled={!examClassId}
              >
                <option value="">Choisir…</option>
                {examTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t.first_name, t.last_name)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Matière</Label>
              <Select
                value={examSubjectId}
                onChange={(e) => setExamSubjectId(e.target.value)}
                required
                disabled={!examTeacherId}
              >
                <option value="">
                  {!examTeacherId
                    ? "Choisissez d’abord un enseignant"
                    : examSubjects.length === 0
                      ? "Aucune matière pour cet enseignant"
                      : "Choisir…"}
                </option>
                {examSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Titre</Label>
              <Input
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="ex. Contrôle de mathématiques"
                required
              />
            </div>
            <div>
              <Label>Description (optionnel)</Label>
              <Textarea
                value={examDescription}
                onChange={(e) => setExamDescription(e.target.value)}
                rows={3}
                placeholder="ex. Chapitres 1 à 3, calculatrice autorisée"
              />
            </div>
            <div>
              <Label>Date du devoir</Label>
              <Input
                type="date"
                value={examDueDate}
                onChange={(e) => setExamDueDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Début</Label>
                <TimeInput24
                  value={examStartTime}
                  onChange={setExamStartTime}
                  required
                />
              </div>
              <div>
                <Label>Fin</Label>
                <TimeInput24
                  value={examEndTime}
                  onChange={setExamEndTime}
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  examSaving ||
                  !examClassId ||
                  !examTeacherId ||
                  !examSubjectId ||
                  !examTitle.trim() ||
                  !examDueDate
                }
              >
                {examSaving ? "Création…" : "Créer et confirmer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
