import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePeriodClosed } from "@/hooks/usePeriodClosed";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { evaluationTypeLabel, TEACHER_EVALUATION_TYPES } from "@/lib/evaluationTypes";
import { supabase } from "@/lib/supabase";
import type { EvaluationType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";

export type EditableEvaluation = {
  id: string;
  subjectId: string;
  period: string;
  type: EvaluationType;
  title: string;
  description: string | null;
  maxScore: number;
  date: string | null;
};

/** Every query that shows evaluations or grading progress. */
const KEYS = [
  "teacher-mes-devoirs",
  "evaluations",
  "teacher-todo",
  "lesson-evaluations",
  "mes-devoirs",
  "student-home",
  "teacher-home",
  "ungraded-by-subject",
  "eval-graded-counts",
];

/**
 * Create or edit a quiz (« interrogation ») or homework (« exercice de maison ») for one class.
 * Exams and compositions are scheduled by the school, so they are not created here.
 */
export function EvaluationFormModal({
  open,
  onClose,
  classId,
  className,
  subjects,
  defaultSubjectId,
  defaultPeriod,
  defaultType = "devoir",
  evaluation,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  subjects: { id: string; name: string }[];
  defaultSubjectId?: string;
  defaultPeriod: string;
  defaultType?: EvaluationType;
  /** set to edit an existing evaluation */
  evaluation?: EditableEvaluation | null;
  /** called with the id and whether it was just created */
  onSaved?: (id: string, created: boolean, type: EvaluationType) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [type, setType] = useState<EvaluationType>(defaultType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [max, setMax] = useState("20");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  /** homework is not graded unless the teacher switches it on */
  const [graded, setGraded] = useState(false);
  // a new exercice de maison that is not graded is plain homework (no trimester, no grade sheet)
  const plainHomework = !evaluation && type === "devoir" && !graded;
  const closed = usePeriodClosed(classId, plainHomework ? undefined : period);

  // fill the form each time it opens
  useEffect(() => {
    if (!open) return;
    setSubjectId(evaluation?.subjectId ?? defaultSubjectId ?? subjects[0]?.id ?? "");
    setPeriod(evaluation?.period ?? defaultPeriod);
    setType(evaluation?.type ?? defaultType);
    setTitle(evaluation?.title ?? "");
    setDescription(evaluation?.description ?? "");
    setMax(String(evaluation?.maxScore ?? 20));
    setDate(evaluation?.date ?? "");
    setGraded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evaluation?.id]);

  const save = async () => {
    if (!user) return;
    if (!subjectId) return toast.error("Choisissez une matière");
    if (!TEACHER_EVALUATION_TYPES.includes(type)) {
      return toast.error("Les examens et compositions sont planifiés par l’administration");
    }
    if (!title.trim()) return toast.error("Donnez un titre");

    if (plainHomework) {
      // saved like the « travail à faire » of the cahier de textes: shown in Exercices de maison, never graded
      const today = new Date().toISOString().slice(0, 10);
      if (date && date < today) return toast.error("La date ne peut pas être dans le passé");
      setSaving(true);
      const homework = [title.trim(), description.trim()].filter(Boolean).join("\n");
      const { data, error } = await supabase
        .from("cahier_entrees")
        .insert({
          class_section_id: classId,
          subject_id: subjectId,
          creneau_id: null,
          entry_date: new Date().toISOString().slice(0, 10),
          content: "",
          homework,
          homework_due: date || null,
        })
        .select("id")
        .single();
      setSaving(false);
      if (error || !data) {
        toast.error(error?.message || "Création impossible");
        return;
      }
      toast.success("Exercice ajouté — visible par les élèves et les parents");
      for (const key of [...KEYS, "teacher-exercices", "enfant-devoirs", "cahier-feed", "devoirs-demain"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      onClose();
      onSaved?.((data as { id: string }).id, true, type);
      return;
    }

    const maxScore = Number(max);
    if (!Number.isFinite(maxScore) || maxScore <= 0) return toast.error("Note maximale invalide");
    if (closed) return toast.error(`Le ${period.toLowerCase()} est clôturé`);

    setSaving(true);
    const payload = {
      class_section_id: classId,
      subject_id: subjectId,
      teacher_id: user.id,
      period_label: period,
      type,
      title: title.trim(),
      description: description.trim() || null,
      max_score: maxScore,
      eval_date: date || null,
      start_time: null,
      end_time: null,
    };
    try {
      let id = evaluation?.id ?? null;
      if (evaluation) {
        const { error } = await supabase.from("evaluations").update(payload).eq("id", evaluation.id);
        if (error) throw error;
        toast.success("Évaluation modifiée");
      } else {
        const { data, error } = await supabase.from("evaluations").insert(payload).select("id").single();
        if (error || !data) throw error ?? new Error("Création impossible");
        id = (data as { id: string }).id;
        toast.success("Évaluation créée");
      }
      for (const key of KEYS) void qc.invalidateQueries({ queryKey: [key] });
      onClose();
      if (id) onSaved?.(id, !evaluation, type);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : evaluation ? "Modification impossible" : "Création impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={evaluation ? "Modifier l’évaluation" : "Nouvelle évaluation"}
      onClose={onClose}
      closeDisabled={saving}
      size="lg"
      className="rounded-lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="text-sm text-slate-500">
          Classe <span className="font-semibold text-slate-800 dark:text-slate-100">{className}</span>
        </p>

        {/* type as two big choices */}
        <div className="grid grid-cols-2 gap-2">
          {TEACHER_EVALUATION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left transition",
                type === t
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600/20 dark:bg-brand-950/30"
                  : "border-slate-200 hover:bg-slate-50 dark:border-[var(--border)] dark:hover:bg-[var(--surface-2)]",
              )}
            >
              <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{evaluationTypeLabel(t)}</span>
              <span className="block text-xs text-slate-500">
                {t === "interrogation" ? "Contrôle rapide en classe" : "Travail à faire à la maison"}
              </span>
            </button>
          ))}
        </div>

        {!evaluation && type === "devoir" ? (
          <button
            type="button"
            role="switch"
            aria-checked={graded}
            onClick={() => setGraded((v) => !v)}
            className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-[var(--border)] dark:hover:bg-[var(--surface-2)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Noté</span>
              <span className="block text-xs text-slate-500">
                {graded
                  ? "Une note sera saisie pour chaque élève."
                  : "Non noté : les élèves voient seulement le travail et la date."}
              </span>
            </span>
            <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", graded ? "bg-brand-700" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", graded ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {subjects.length > 1 ? (
            <div>
              <Label htmlFor="eval-subject">Matière</Label>
              <Select id="eval-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className={plainHomework ? "hidden" : undefined}>
            <Label htmlFor="eval-period">Trimestre</Label>
            <Select id="eval-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {TRIMESTER_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="eval-title">Titre</Label>
            <Input
              id="eval-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "interrogation" ? "Ex. Interrogation chapitre 3" : "Ex. Exercices page 42"}
            />
          </div>
          <div>
            <Label htmlFor="eval-date">{type === "devoir" ? "Pour quand ?" : "Date"}</Label>
            <Input id="eval-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={plainHomework ? "hidden" : undefined}>
            <Label htmlFor="eval-max">Note maximale</Label>
            <Input id="eval-max" type="number" min={1} step={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="eval-desc">Description (facultatif)</Label>
            <Textarea
              id="eval-desc"
              className="min-h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. Exercices 1 à 4, à présenter en classe…"
            />
          </div>
        </div>

        {closed && !plainHomework ? (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <Lock className="h-4 w-4" />
            Le {period.toLowerCase()} est clôturé : choisissez un autre trimestre.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || (closed && !plainHomework)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving
              ? "Enregistrement…"
              : evaluation
                ? "Enregistrer"
                : type === "interrogation"
                  ? "Créer et saisir les notes"
                  : graded
                    ? "Créer l’exercice noté"
                    : "Ajouter l’exercice"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
