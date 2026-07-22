import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActingTeacherId } from "@/hooks/useActingTeacherId";
import { formatExamSchedule, formatTimeHm } from "@/lib/assignmentKinds";
import { supabase } from "@/lib/supabase";
import type { Evaluation, EvaluationType, Profile, Subject } from "@/lib/types";
import {
  TEACHER_EVALUATION_TYPES,
  evaluationTypeLabel,
  evaluationTypeTone,
} from "@/lib/evaluationTypes";
import { formatDateSafe } from "@/lib/dateFr";
import { fullName, joinProfile } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { SaveButton } from "@/components/SaveButton";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
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

const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

type GradeState = {
  score: string;
  absent: boolean;
  comment: string;
};

const EMPTY_GRADE: GradeState = { score: "", absent: false, comment: "" };

/** Stable empty defaults — inline `= []` creates a new array every render and can loop useEffects. */
const EMPTY_OPEN_GRADES: {
  id: string;
  student_id: string;
  score: number;
  max_score: number;
  comment: string | null;
  is_absent: boolean;
}[] = [];

function dueLabel(type: EvaluationType): string {
  if (type === "examen") return "Date du devoir";
  if (type === "devoir") return "À rendre le";
  return "Date";
}

export default function Notes() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const fromDevoirs = searchParams.get("from") === "devoirs";
  const paramSubject = searchParams.get("subject");
  const paramPeriod = searchParams.get("period");
  const { user, role } = useAuth();
  const { actingTeacherId, isProxy, proxyTeacherId } = useActingTeacherId();
  const qc = useQueryClient();
  /** Admins never need a second admin to confirm their own exam. */
  const autoConfirmExam = role === "school_admin";

  const [subjectId, setSubjectId] = useState(paramSubject ?? "");
  const [period, setPeriod] = useState(
    paramPeriod && PERIODS.includes(paramPeriod) ? paramPeriod : PERIODS[0],
  );
  /** Once we have applied URL or smart default, don't override the teacher's choice. */
  const defaultApplied = useRef(Boolean(paramSubject));

  // Create / edit form.
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newType, setNewType] = useState<EvaluationType>("devoir");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newMax, setNewMax] = useState("20");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Evaluation | null>(null);

  // Which evaluation's grade grid is open.
  const [openGradeId, setOpenGradeId] = useState<string | null>(null);

  // Grade grid state.
  const [grades, setGrades] = useState<Record<string, GradeState>>({});
  const [savingGrades, setSavingGrades] = useState(false);

  const { data: proxyProfile } = useQuery({
    queryKey: ["profil-proxy", proxyTeacherId],
    enabled: !!proxyTeacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profils")
        .select("first_name, last_name")
        .eq("id", proxyTeacherId!)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<Profile, "first_name" | "last_name"> | null;
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["class-subjects", id, actingTeacherId, isProxy],
    enabled: !!id && !!actingTeacherId,
    queryFn: async () => {
      let q = supabase
        .from("affectations_enseignement")
        .select("matieres(*)")
        .eq("class_section_id", id!);
      // Admin saisie for a teacher → only that teacher's subjects.
      // Plain admin (no teacherId) still sees all class subjects.
      if (isProxy) q = q.eq("teacher_id", actingTeacherId!);
      const { data } = await q;
      const unique = new Map<string, Subject>();
      for (const row of data ?? []) {
        const sub = (row as unknown as { matieres: Subject }).matieres;
        if (sub) unique.set(sub.id, sub);
      }
      return [...unique.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );
    },
  });

  useEffect(() => {
    if (defaultApplied.current) {
      // URL/smart pick already applied — still validate subject exists once list loads.
      if (
        subjectId &&
        subjects.length > 0 &&
        !subjects.some((s) => s.id === subjectId)
      ) {
        setSubjectId(subjects[0]!.id);
      }
      return;
    }
    if (subjects.length === 0 || !actingTeacherId || !id) return;

    let cancelled = false;
    void (async () => {
      const { data: evals } = await supabase
        .from("evaluations")
        .select("id, subject_id, period_label, created_at")
        .eq("class_section_id", id)
        .eq("teacher_id", actingTeacherId)
        .order("created_at", { ascending: true });
      if (cancelled) return;

      const rows = (evals ?? []) as {
        id: string;
        subject_id: string;
        period_label: string;
      }[];
      const knownSubjects = new Set(subjects.map((s) => s.id));
      const relevant = rows.filter((r) => knownSubjects.has(r.subject_id));

      let focus = relevant[0] ?? null;
      if (relevant.length > 0) {
        const ids = relevant.map((r) => r.id);
        const { data: notes } = await supabase
          .from("notes")
          .select("evaluation_id")
          .in("evaluation_id", ids);
        if (cancelled) return;
        const graded = new Set(
          (notes ?? [])
            .map((n) => (n as { evaluation_id: string | null }).evaluation_id)
            .filter(Boolean),
        );
        focus = relevant.find((r) => !graded.has(r.id)) ?? relevant[0] ?? null;
      }

      defaultApplied.current = true;
      if (focus) {
        setSubjectId(focus.subject_id);
        if (PERIODS.includes(focus.period_label)) {
          setPeriod(focus.period_label);
        }
      } else {
        setSubjectId(subjects[0]!.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subjects, actingTeacherId, id, subjectId]);

  const { data: students = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["class-roster", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select(
          "profils:profils!inscriptions_student_id_fkey(*)",
        )
        .eq("class_section_id", id!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id)
        .sort((a, b) =>
          fullName(a.first_name, a.last_name).localeCompare(
            fullName(b.first_name, b.last_name),
            "fr",
          ),
        );
    },
  });

  const { data: evaluations = [], isLoading: evalLoading } = useQuery({
    queryKey: ["evaluations", id, subjectId, period, actingTeacherId, isProxy],
    enabled: !!id && !!subjectId,
    queryFn: async () => {
      let q = supabase
        .from("evaluations")
        .select("*")
        .eq("class_section_id", id!)
        .eq("subject_id", subjectId)
        .eq("period_label", period);
      if (isProxy) q = q.eq("teacher_id", actingTeacherId!);
      const { data, error } = await q
        .order("eval_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Evaluation[];
    },
  });

  // Other exams already scheduled in this class (any subject/teacher) —
  // one exam per class per day, so we warn before a conflicting date.
  const { data: classExams = [] } = useQuery({
    queryKey: ["examen-jours-classe", id],
    enabled: !!id && newType === "examen" && showForm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, title, eval_date, start_time, end_time, matieres(name)")
        .eq("class_section_id", id!)
        .eq("type", "examen")
        .not("eval_date", "is", null)
        .order("eval_date");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        eval_date: string;
        start_time: string | null;
        end_time: string | null;
        matieres: { name: string } | null;
      }[];
    },
  });

  const bookedDays = useMemo(
    () => classExams.filter((e) => e.id !== editingId),
    [classExams, editingId],
  );

  const dayConflict = useMemo(() => {
    if (newType !== "examen" || !newDate) return null;
    return bookedDays.find((e) => e.eval_date === newDate) ?? null;
  }, [newType, newDate, bookedDays]);

  const examConflictMessage = (conflict: {
    title: string;
    matieres: { name: string } | null;
    start_time: string | null;
    end_time: string | null;
  }) => {
    const subject = conflict.matieres?.name ?? "une autre matière";
    const schedule = formatExamSchedule({
      due_date: newDate || null,
      start_time: conflict.start_time,
      end_time: conflict.end_time,
    });
    return `Un devoir est déjà prévu ce jour pour cette classe (${subject}${
      schedule ? ` · ${schedule}` : ""
    }). Choisissez une autre date.`;
  };

  // Grades for whatever evaluation is currently open in the grid.
  const { data: openGrades = EMPTY_OPEN_GRADES } = useQuery({
    queryKey: ["eval-grades", openGradeId],
    enabled: !!openGradeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, student_id, score, max_score, comment, is_absent")
        .eq("evaluation_id", openGradeId!);
      if (error) throw error;
      return data as {
        id: string;
        student_id: string;
        score: number;
        max_score: number;
        comment: string | null;
        is_absent: boolean;
      }[];
    },
  });

  // How many students are graded per evaluation (for the list badges).
  const { data: gradedCounts = {} } = useQuery({
    queryKey: ["eval-graded-counts", id, subjectId, period],
    enabled: !!id && !!subjectId && evaluations.length > 0,
    queryFn: async () => {
      const ids = evaluations.map((e) => e.id);
      const { data, error } = await supabase
        .from("notes")
        .select("evaluation_id")
        .in("evaluation_id", ids);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const eid = (row as { evaluation_id: string | null }).evaluation_id;
        if (eid) counts[eid] = (counts[eid] ?? 0) + 1;
      }
      return counts;
    },
  });

  // Ungraded evaluations per subject (for the matière catalogue markers).
  // An évaluation stays "à noter" until every active student has a note.
  const { data: ungradedBySubject = {} } = useQuery({
    queryKey: ["ungraded-by-subject", id, period, actingTeacherId],
    enabled: !!id && !!actingTeacherId && subjects.length > 0,
    queryFn: async () => {
      const subjectIds = subjects.map((s) => s.id);
      const [{ data: evals, error }, { count: rosterSize }] = await Promise.all([
        supabase
          .from("evaluations")
          .select("id, subject_id")
          .eq("class_section_id", id!)
          .eq("period_label", period)
          .eq("teacher_id", actingTeacherId!)
          .in("subject_id", subjectIds),
        supabase
          .from("inscriptions")
          .select("id", { count: "exact", head: true })
          .eq("class_section_id", id!)
          .eq("status", "active"),
      ]);
      if (error) throw error;
      const rows = (evals ?? []) as { id: string; subject_id: string }[];
      if (rows.length === 0) return {} as Record<string, number>;

      const total = rosterSize ?? 0;
      const { data: notes } = await supabase
        .from("notes")
        .select("evaluation_id")
        .in(
          "evaluation_id",
          rows.map((r) => r.id),
        );
      const noteCounts = new Map<string, number>();
      for (const n of notes ?? []) {
        const eid = (n as { evaluation_id: string | null }).evaluation_id;
        if (eid) noteCounts.set(eid, (noteCounts.get(eid) ?? 0) + 1);
      }

      const counts: Record<string, number> = {};
      for (const ev of rows) {
        const noted = noteCounts.get(ev.id) ?? 0;
        if (total === 0 || noted < total) {
          counts[ev.subject_id] = (counts[ev.subject_id] ?? 0) + 1;
        }
      }
      return counts;
    },
  });

  const openEval = useMemo(
    () => evaluations.find((e) => e.id === openGradeId) ?? null,
    [evaluations, openGradeId],
  );

  // Seed the grid when the open evaluation's grades load.
  useEffect(() => {
    if (!openGradeId) {
      setGrades((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const next: Record<string, GradeState> = {};
    for (const g of openGrades) {
      next[g.student_id] = {
        score: g.is_absent ? "" : String(g.score),
        absent: g.is_absent,
        comment: g.comment ?? "",
      };
    }
    setGrades((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [openGradeId, openGrades]);

  const getGrade = (studentId: string): GradeState =>
    grades[studentId] ?? EMPTY_GRADE;

  const setGrade = (studentId: string, patch: Partial<GradeState>) =>
    setGrades((prev) => ({
      ...prev,
      [studentId]: { ...getGrade(studentId), ...patch },
    }));

  const gridDirty = useMemo(
    () =>
      Object.values(grades).some(
        (g) => g.absent || g.score.trim() !== "" || g.comment.trim() !== "",
      ),
    [grades],
  );

  const resetForm = () => {
    setEditingId(null);
    setNewType("devoir");
    setNewTitle("");
    setNewDescription("");
    setNewDate("");
    setNewStartTime("");
    setNewEndTime("");
    setNewMax("20");
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (ev: Evaluation) => {
    setEditingId(ev.id);
    setNewType(ev.type);
    setNewTitle(ev.title);
    setNewDescription(ev.description ?? "");
    setNewDate(ev.eval_date ?? "");
    setNewStartTime(formatTimeHm(ev.start_time));
    setNewEndTime(formatTimeHm(ev.end_time));
    setNewMax(String(ev.max_score));
    setOpenGradeId(null);
    setShowForm(true);
  };

  const isExam = newType === "examen";

  const handleSubmit = async () => {
    if (!id || !user || !actingTeacherId || !subjectId) {
      toast.error("Choisissez une matière");
      return;
    }
    if (!TEACHER_EVALUATION_TYPES.includes(newType)) {
      toast.error(
        "Les compositions et devoirs sont planifiés par l’administration",
      );
      return;
    }
    if (!newTitle.trim()) {
      toast.error("Donnez un titre");
      return;
    }
    const max = Number(newMax);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Note maximale invalide");
      return;
    }
    if (isExam) {
      if (!newDate) {
        toast.error("Indiquez la date du devoir");
        return;
      }
      if (!newStartTime || !newEndTime) {
        toast.error("Indiquez le créneau horaire (début et fin)");
        return;
      }
      if (newStartTime >= newEndTime) {
        toast.error("L’heure de fin doit être après l’heure de début");
        return;
      }

      // One exam per class per day — check before write (DB also enforces).
      let conflictQuery = supabase
        .from("evaluations")
        .select("id, title, eval_date, start_time, end_time, matieres(name)")
        .eq("type", "examen")
        .eq("class_section_id", id)
        .eq("eval_date", newDate)
        .limit(1);
      if (editingId) conflictQuery = conflictQuery.neq("id", editingId);
      const { data: conflicts, error: conflictError } = await conflictQuery;
      if (conflictError) {
        toast.error(conflictError.message || "Vérification impossible");
        return;
      }
      const conflict = conflicts?.[0] as
        | {
            title: string;
            matieres: { name: string } | null;
            start_time: string | null;
            end_time: string | null;
          }
        | undefined;
      if (conflict) {
        toast.error(examConflictMessage(conflict));
        return;
      }
    }

    setSaving(true);
    const existing = editingId
      ? evaluations.find((e) => e.id === editingId)
      : null;

    const scheduleChanged =
      isExam &&
      existing &&
      (existing.eval_date !== (newDate || null) ||
        formatTimeHm(existing.start_time) !== newStartTime ||
        formatTimeHm(existing.end_time) !== newEndTime);

    const payload: Record<string, unknown> = {
      class_section_id: id,
      subject_id: subjectId,
      teacher_id: actingTeacherId,
      period_label: period,
      type: newType,
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      max_score: max,
      eval_date: newDate || null,
      start_time: isExam ? newStartTime || null : null,
      end_time: isExam ? newEndTime || null : null,
    };

    if (isExam) {
      if (autoConfirmExam) {
        payload.admin_confirmed = true;
        payload.confirmed_at = new Date().toISOString();
        payload.confirmed_by = user.id;
      } else if (!editingId || scheduleChanged) {
        payload.admin_confirmed = false;
        payload.confirmed_at = null;
        payload.confirmed_by = null;
      }
    }

    const handleWriteError = (error: { code?: string; message?: string }) => {
      if (isExam && error.code === "23505") {
        toast.error(
          "Un devoir est déjà prévu ce jour pour cette classe. Choisissez une autre date.",
        );
        return;
      }
      toast.error(
        error.message ||
          (editingId ? "Modification impossible" : "Erreur lors de la création"),
      );
    };

    if (editingId) {
      const { error } = await supabase
        .from("evaluations")
        .update(payload)
        .eq("id", editingId);
      setSaving(false);
      if (error) {
        handleWriteError(error);
        return;
      }
      toast.success(
        isExam
          ? autoConfirmExam
            ? "Devoir modifié"
            : scheduleChanged
              ? "Devoir modifié — en attente de confirmation admin"
              : "Devoir modifié"
          : "Évaluation modifiée",
      );
    } else {
      const { data, error } = await supabase
        .from("evaluations")
        .insert(payload)
        .select("id")
        .single();
      setSaving(false);
      if (error || !data) {
        handleWriteError(error ?? { message: "Création impossible" });
        return;
      }
      toast.success(
        isExam
          ? autoConfirmExam
            ? "Devoir créé et confirmé"
            : "Devoir proposé — en attente de confirmation par l’administration"
          : "Évaluation créée",
      );
      setOpenGradeId((data as { id: string }).id);
    }

    resetForm();
    void qc.invalidateQueries({ queryKey: ["evaluations", id, subjectId, period] });
    void qc.invalidateQueries({ queryKey: ["examen-jours-classe", id] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
    void qc.invalidateQueries({
      queryKey: ["ungraded-by-subject", id, period, actingTeacherId],
    });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
  };

  const handleDelete = async (ev: Evaluation) => {
    setDeletingId(ev.id);
    const { error } = await supabase.from("evaluations").delete().eq("id", ev.id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success("Supprimé");
    setPendingDelete(null);
    if (editingId === ev.id) resetForm();
    if (openGradeId === ev.id) setOpenGradeId(null);
    void qc.invalidateQueries({ queryKey: ["evaluations", id, subjectId, period] });
    void qc.invalidateQueries({ queryKey: ["examen-jours-classe", id] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
    void qc.invalidateQueries({
      queryKey: ["ungraded-by-subject", id, period, actingTeacherId],
    });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
  };

  const saveGrades = async () => {
    if (!openEval || !id || !user) return;
    setSavingGrades(true);
    try {
      const existingByStudent = new Map(openGrades.map((g) => [g.student_id, g]));
      for (const student of students) {
        const g = getGrade(student.id);
        const hasValue = g.absent || g.score.trim() !== "";
        const existing = existingByStudent.get(student.id);

        if (!hasValue) {
          if (existing) {
            await supabase.from("notes").delete().eq("id", existing.id);
          }
          continue;
        }

        const score = g.absent ? 0 : Number(g.score);
        if (!g.absent && !Number.isFinite(score)) continue;

        const payload = {
          student_id: student.id,
          subject_id: openEval.subject_id,
          class_section_id: id,
          period_label: openEval.period_label,
          evaluation_id: openEval.id,
          score,
          max_score: openEval.max_score,
          is_absent: g.absent,
          comment: g.comment.trim() || null,
          recorded_by: isProxy ? actingTeacherId! : user.id,
        };

        if (existing) {
          await supabase.from("notes").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("notes").insert(payload);
        }
      }
      const savedCount = students.filter((s) => {
        const g = getGrade(s.id);
        return g.absent || g.score.trim() !== "";
      }).length;
      toast.success("Notes enregistrées", {
        description: `${savedCount}/${students.length} élève(s) · ${openEval.title}`,
      });
      setOpenGradeId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["eval-grades", openEval.id] }),
        qc.invalidateQueries({
          queryKey: ["eval-graded-counts", id, subjectId, period],
        }),
        qc.invalidateQueries({
          queryKey: ["ungraded-by-subject", id, period, actingTeacherId],
        }),
        qc.invalidateQueries({ queryKey: ["notes"] }),
        qc.invalidateQueries({ queryKey: ["mes-notes"] }),
        qc.invalidateQueries({ queryKey: ["mes-devoirs"] }),
        qc.invalidateQueries({ queryKey: ["student-home"] }),
        qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSavingGrades(false);
    }
  };

  const gradedNow = useMemo(
    () =>
      students.filter((s) => {
        const g = getGrade(s.id);
        return g.absent || g.score.trim() !== "";
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, grades],
  );

  const canManageStructure =
    role === "school_admin" || role === "super_admin";
  /** Teachers grade everything but only create / edit devoirs & interros. */
  const canEditEval = (ev: Evaluation) =>
    canManageStructure ||
    isProxy ||
    (ev.type !== "composition" && ev.type !== "examen");

  const proxyName = proxyProfile
    ? fullName(proxyProfile.first_name, proxyProfile.last_name)
    : null;

  return (
    <div>
      <ConfirmPasswordDialog
        open={!!pendingDelete}
        title={
          pendingDelete
            ? `Supprimer « ${pendingDelete.title} » ?`
            : "Confirmer"
        }
        description="Cette évaluation et les notes liées seront définitivement retirées. Saisissez votre mot de passe pour confirmer."
        confirmLabel="Supprimer"
        onCancel={() => setPendingDelete(null)}
        onVerified={async () => {
          if (pendingDelete) await handleDelete(pendingDelete);
        }}
      />
      <Link
        to={
          isProxy
            ? `/saisie-enseignant?teacherId=${encodeURIComponent(proxyTeacherId!)}`
            : fromDevoirs
              ? "/devoirs"
              : `/classes/${id}`
        }
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {isProxy
          ? "Retour à la saisie enseignant"
          : fromDevoirs
            ? "Retour aux devoirs & évaluations"
            : "Retour à la classe"}
      </Link>

      <PageHeader
        title="Devoirs & évaluations"
        subtitle={
          isProxy && proxyName
            ? `Saisie pour ${proxyName}`
            : "Interrogations et exercices de maison — compositions et devoirs sont planifiés par l’administration"
        }
      />

      {isProxy ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
          Mode secrétariat — les exercices et devoirs sont enregistrés au nom
          de {proxyName ?? "l’enseignant"}. Confirmation admin automatique
          pour les devoirs.
        </p>
      ) : null}

      <p className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        Créez vos interrogations et devoirs à rendre, puis notez la classe
        quand vous voulez. Les compositions et devoirs sont planifiés par
        l’administration (onglets Devoirs et Compositions) — vous les notez
        ici une fois créés.
      </p>

      <div className="mb-6 grid max-w-lg gap-4 sm:grid-cols-2">
        <div>
          <Label>Matière</Label>
          <Select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setOpenGradeId(null);
            }}
            className={
              subjectId && (ungradedBySubject[subjectId] ?? 0) > 0
                ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-100 dark:border-amber-500/60 dark:bg-amber-950/30"
                : undefined
            }
          >
            <option value="">Choisir…</option>
            {[...subjects]
              .sort((a, b) => {
                const ua = ungradedBySubject[a.id] ?? 0;
                const ub = ungradedBySubject[b.id] ?? 0;
                if (ua > 0 && ub === 0) return -1;
                if (ub > 0 && ua === 0) return 1;
                return a.name.localeCompare(b.name, "fr");
              })
              .map((s) => {
              const n = ungradedBySubject[s.id] ?? 0;
              return (
                <option key={s.id} value={s.id}>
                  {n > 0
                    ? `${s.name} — ${n} à noter`
                    : s.name}
                </option>
              );
            })}
          </Select>
          {(ungradedBySubject[subjectId] ?? 0) > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              {ungradedBySubject[subjectId]} évaluation
              {ungradedBySubject[subjectId]! > 1 ? "s" : ""} à terminer pour
              cette période
            </p>
          ) : null}
        </div>
        <div>
          <Label>Période</Label>
          <Select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setOpenGradeId(null);
            }}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!subjectId ? (
        <EmptyState message="Sélectionnez une matière pour gérer les devoirs et évaluations." />
      ) : (
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {period}
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={() => (showForm ? resetForm() : openCreate())}
              >
                <Plus className="h-4 w-4" />
                {showForm ? "Fermer" : "Nouveau"}
              </Button>
            </div>

            {showForm ? (
              <Card className="mb-4 max-w-xl">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={newType}
                      onChange={(e) =>
                        setNewType(e.target.value as EvaluationType)
                      }
                    >
                      {TEACHER_EVALUATION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {evaluationTypeLabel(t)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Note maximale</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={newMax}
                      onChange={(e) => setNewMax(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Titre</Label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Ex : Devoir n°1, Composition du 1er trimestre…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Description (facultatif)</Label>
                    <Textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Ex. : Exercices page 42, à présenter en classe…"
                    />
                  </div>
                  <div>
                    <Label>{dueLabel(newType)}</Label>
                    <Input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      required={isExam}
                    />
                    {isExam && dayConflict ? (
                      <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                        {examConflictMessage(dayConflict)}
                      </p>
                    ) : null}
                  </div>
                  {isExam ? (
                    <>
                      <div>
                        <Label htmlFor="exam-start">Heure de début</Label>
                        <TimeInput24
                          id="exam-start"
                          value={newStartTime}
                          onChange={setNewStartTime}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="exam-end">Heure de fin</Label>
                        <TimeInput24
                          id="exam-end"
                          value={newEndTime}
                          onChange={setNewEndTime}
                          required
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                {isExam && bookedDays.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      Jours déjà pris dans cette classe
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {bookedDays.map((e) => {
                        const slot = formatExamSchedule({
                          due_date: e.eval_date,
                          start_time: e.start_time,
                          end_time: e.end_time,
                        });
                        return (
                          <li key={e.id}>
                            {formatDateSafe(e.eval_date, "d MMM yyyy", {
                              locale: fr,
                            })}
                            {" — "}
                            {e.matieres?.name ?? "Matière"}
                            {slot ? ` · ${slot}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {isExam ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {autoConfirmExam
                      ? "Confirmation admin automatique."
                      : "Le devoir n’est officiel pour les élèves qu’après confirmation par l’administration."}
                  </p>
                ) : null}

                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    disabled={saving || (isExam && !!dayConflict)}
                    onClick={() => void handleSubmit()}
                  >
                    {saving
                      ? "Enregistrement…"
                      : editingId
                        ? "Enregistrer"
                        : "Créer"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Annuler
                  </Button>
                </div>
              </Card>
            ) : null}

            {evalLoading ? (
              <p className="text-slate-500">Chargement…</p>
            ) : evaluations.length === 0 ? (
              <EmptyState message="Rien pour cette matière et cette période. Créez une interrogation ou un devoir à rendre." />
            ) : (
              <div className="space-y-2">
                {evaluations.map((ev) => {
                  const count = gradedCounts[ev.id] ?? 0;
                  const total = students.length;
                  const complete = total > 0 && count >= total;
                  const isOpen = openGradeId === ev.id;
                  const schedule = formatExamSchedule({
                    due_date: ev.eval_date,
                    start_time: ev.start_time,
                    end_time: ev.end_time,
                  });
                  return (
                    <Card
                      key={ev.id}
                      className={
                        "flex flex-wrap items-center justify-between gap-3 py-3" +
                        (isOpen ? " ring-2 ring-brand-400" : "")
                      }
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={evaluationTypeTone(ev.type)}>
                            {evaluationTypeLabel(ev.type)}
                          </Badge>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {ev.title}
                          </span>
                          {ev.type === "examen" ? (
                            <Badge tone={ev.admin_confirmed ? "success" : "warning"}>
                              {ev.admin_confirmed ? "Confirmé" : "En attente admin"}
                            </Badge>
                          ) : null}
                        </div>
                        {ev.description ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {ev.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          / {ev.max_score}
                          {ev.eval_date
                            ? ` · ${formatDateSafe(ev.eval_date, "d MMM yyyy", { locale: fr })}`
                            : ""}
                          {schedule ? ` · ${schedule}` : ""}
                          {" · "}
                          <span
                            className={
                              complete
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }
                          >
                            {count}/{total} noté(s)
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={isOpen ? "primary" : "outline"}
                          onClick={() => {
                            setShowForm(false);
                            setOpenGradeId(isOpen ? null : ev.id);
                          }}
                        >
                          {complete ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Pencil className="h-4 w-4" />
                          )}
                          {isOpen ? "Fermer" : "Noter"}
                        </Button>
                        {canEditEval(ev) ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(ev)}
                              title="Modifier"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={deletingId === ev.id}
                              onClick={() => setPendingDelete(ev)}
                              title="Supprimer"
                              className="text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {openEval ? (
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    {evaluationTypeLabel(openEval.type)} — {openEval.title}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Note sur {openEval.max_score} · {gradedNow}/{students.length}{" "}
                    saisie(s)
                  </p>
                </div>
                <SaveButton
                  type="button"
                  saving={savingGrades}
                  dirty={gridDirty}
                  onClick={() => void saveGrades()}
                />
              </div>

              {rosterLoading ? (
                <p className="text-slate-500">Chargement…</p>
              ) : students.length === 0 ? (
                <EmptyState message="Aucun élève dans cette classe." />
              ) : (
                <div className="space-y-2">
                  {students.map((s) => {
                    const g = getGrade(s.id);
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
                      >
                        <span className="min-w-[10rem] flex-1 font-medium text-slate-800 dark:text-slate-100">
                          <PersonName first={s.first_name} last={s.last_name} />
                        </span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={openEval.max_score}
                            step={0.25}
                            placeholder={`/${openEval.max_score}`}
                            className="w-24"
                            disabled={g.absent}
                            value={g.score}
                            onChange={(e) =>
                              setGrade(s.id, { score: e.target.value })
                            }
                          />
                          <span className="text-sm text-slate-500">
                            / {openEval.max_score}
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={g.absent}
                            onChange={(e) =>
                              setGrade(s.id, {
                                absent: e.target.checked,
                                score: e.target.checked ? "" : g.score,
                              })
                            }
                          />
                          Absent
                        </label>
                        <Input
                          className="w-full sm:w-48"
                          placeholder="Appréciation (facultatif)"
                          value={g.comment}
                          onChange={(e) =>
                            setGrade(s.id, { comment: e.target.value })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
