import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Pencil, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Evaluation, EvaluationType, Profile, Subject } from "@/lib/types";
import {
  EVALUATION_TYPES,
  evaluationTypeLabel,
} from "@/lib/evaluationTypes";
import { formatDateSafe } from "@/lib/dateFr";
import { fullName } from "@/lib/utils";
import { SaveButton } from "@/components/SaveButton";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
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

export default function Notes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState(PERIODS[0]);

  // Which evaluation grid is open. "new" shows the create form.
  const [openId, setOpenId] = useState<string | null>(null);

  // New-evaluation form.
  const [newType, setNewType] = useState<EvaluationType>("devoir");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newMax, setNewMax] = useState("20");
  const [creating, setCreating] = useState(false);

  // Grade grid state.
  const [grades, setGrades] = useState<Record<string, GradeState>>({});
  const [saving, setSaving] = useState(false);

  const { data: subjects = [] } = useQuery({
    queryKey: ["class-subjects", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("matieres(*)")
        .eq("class_section_id", id!);
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
    if (!subjectId && subjects.length > 0) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  const { data: students = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["class-roster", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("profils(*)")
        .eq("class_section_id", id!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r) => (r as unknown as { profils: Profile }).profils)
        .filter(Boolean)
        .sort((a, b) =>
          fullName(a.first_name, a.last_name).localeCompare(
            fullName(b.first_name, b.last_name),
            "fr",
          ),
        );
    },
  });

  const { data: evaluations = [], isLoading: evalLoading } = useQuery({
    queryKey: ["evaluations", id, subjectId, period],
    enabled: !!id && !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("*")
        .eq("class_section_id", id!)
        .eq("subject_id", subjectId)
        .eq("period_label", period)
        .order("eval_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Evaluation[];
    },
  });

  // Grades for whatever evaluation is currently open in the grid.
  const { data: openGrades = EMPTY_OPEN_GRADES } = useQuery({
    queryKey: ["eval-grades", openId],
    enabled: !!openId && openId !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, student_id, score, max_score, comment, is_absent")
        .eq("evaluation_id", openId!);
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

  const openEval = useMemo(
    () => evaluations.find((e) => e.id === openId) ?? null,
    [evaluations, openId],
  );

  // Seed the grid when the open evaluation's grades load.
  useEffect(() => {
    if (!openId || openId === "new") {
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
  }, [openId, openGrades]);

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

  const resetNewForm = () => {
    setNewType("devoir");
    setNewTitle("");
    setNewDate("");
    setNewMax("20");
  };

  const createEvaluation = async () => {
    if (!id || !user || !subjectId) {
      toast.error("Choisissez une matière");
      return;
    }
    if (!newTitle.trim()) {
      toast.error("Donnez un titre à l’évaluation");
      return;
    }
    const max = Number(newMax);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Note maximale invalide");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("evaluations")
      .insert({
        class_section_id: id,
        subject_id: subjectId,
        teacher_id: user.id,
        period_label: period,
        type: newType,
        title: newTitle.trim(),
        max_score: max,
        eval_date: newDate || null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message || "Création impossible");
      return;
    }
    toast.success("Évaluation créée");
    resetNewForm();
    await qc.invalidateQueries({ queryKey: ["evaluations", id, subjectId, period] });
    setGrades({});
    setOpenId((data as { id: string }).id);
  };

  const saveGrades = async () => {
    if (!openEval || !id || !user) return;
    setSaving(true);
    try {
      const existingByStudent = new Map(openGrades.map((g) => [g.student_id, g]));
      for (const student of students) {
        const g = getGrade(student.id);
        const hasValue = g.absent || g.score.trim() !== "";
        const existing = existingByStudent.get(student.id);

        if (!hasValue) {
          // Cleared a previously saved grade → remove it.
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
          recorded_by: user.id,
        };

        if (existing) {
          await supabase.from("notes").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("notes").insert(payload);
        }
      }
      toast.success("Notes enregistrées");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["eval-grades", openEval.id] }),
        qc.invalidateQueries({
          queryKey: ["eval-graded-counts", id, subjectId, period],
        }),
        qc.invalidateQueries({ queryKey: ["notes"] }),
        qc.invalidateQueries({ queryKey: ["mes-notes"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
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

  return (
    <div>
      <Link
        to={`/classes/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la classe
      </Link>

      <PageHeader
        title="Notes & évaluations"
        subtitle="Créez une évaluation puis saisissez les notes de la classe"
      />

      <div className="mb-6 grid max-w-lg gap-4 sm:grid-cols-2">
        <div>
          <Label>Matière</Label>
          <Select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setOpenId(null);
            }}
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
          <Label>Période</Label>
          <Select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setOpenId(null);
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
        <EmptyState message="Sélectionnez une matière pour gérer les évaluations." />
      ) : (
        <div className="space-y-6">
          {/* Evaluations list */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Évaluations — {period}
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  resetNewForm();
                  setGrades({});
                  setOpenId((prev) => (prev === "new" ? null : "new"));
                }}
              >
                <Plus className="h-4 w-4" />
                Nouvelle évaluation
              </Button>
            </div>

            {openId === "new" ? (
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
                      {EVALUATION_TYPES.map((t) => (
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
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    disabled={creating}
                    onClick={() => void createEvaluation()}
                  >
                    {creating ? "Création…" : "Créer et noter"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpenId(null)}
                  >
                    Annuler
                  </Button>
                </div>
              </Card>
            ) : null}

            {evalLoading ? (
              <p className="text-slate-500">Chargement…</p>
            ) : evaluations.length === 0 ? (
              <EmptyState message="Aucune évaluation pour cette matière et cette période." />
            ) : (
              <div className="space-y-2">
                {evaluations.map((ev) => {
                  const count = gradedCounts[ev.id] ?? 0;
                  const total = students.length;
                  const complete = total > 0 && count >= total;
                  const isOpen = openId === ev.id;
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
                          <Badge>{evaluationTypeLabel(ev.type)}</Badge>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {ev.title}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          / {ev.max_score}
                          {ev.eval_date
                            ? ` · ${formatDateSafe(ev.eval_date, "d MMM yyyy", { locale: fr })}`
                            : ""}
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
                      <Button
                        type="button"
                        size="sm"
                        variant={isOpen ? "primary" : "outline"}
                        onClick={() => {
                          setGrades({});
                          setOpenId(isOpen ? null : ev.id);
                        }}
                      >
                        {complete ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Pencil className="h-4 w-4" />
                        )}
                        {isOpen ? "Fermer" : "Noter"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grade grid for the open evaluation */}
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
                  saving={saving}
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
                          {fullName(s.first_name, s.last_name)}
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
