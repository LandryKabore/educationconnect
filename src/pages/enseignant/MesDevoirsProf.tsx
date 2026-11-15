import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fr } from "date-fns/locale";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { ClassColorDot } from "@/components/ClassColor";
import { EvaluationFormModal, type EditableEvaluation } from "@/components/EvaluationFormModal";
import { useResolvedGradingPeriod } from "@/hooks/useGradingPeriodState";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatDateSafe } from "@/lib/dateFr";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import type { EvaluationType } from "@/lib/types";
import { BackLink, Card, EmptyState } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type EvalRow = {
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  period: string;
  type: EvaluationType;
  date: string | null;
  title: string;
  description: string | null;
  maxScore: number;
  confirmed: boolean;
  graded: number;
};

type ClassRow = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  roster: number;
  evals: EvalRow[];
  toGrade: number;
  /** subjects this teacher teaches in the class */
  subjects: { id: string; name: string }[];
};

const TYPE_STYLE: Record<EvaluationType, string> = {
  interrogation: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
  devoir: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  examen: "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300",
  composition: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
};

/** An evaluation is finished once every student of the class has a grade. */
const isComplete = (e: EvalRow, roster: number) => roster > 0 && e.graded >= roster;

/** Teacher: all evaluations per class, with grading progress and what is left to do. */
export default function MesDevoirsProf() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // opened on a class from another page (class card, lesson…): offer the way back
  const [openedFromLink] = useState(() => !!params.get("classe"));

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["teacher-mes-devoirs", user?.id, "v2"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, subject_id, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", user!.id);
      if (error) throw error;
      const byClass = new Map<string, { classId: string; className: string; gradeLevel: string | null }>();
      const subjectsByClass = new Map<string, { id: string; name: string }[]>();
      for (const row of aff ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          subject_id: string;
          classes: { id: string; name: string; grade_level: string | null } | null;
          matieres: { name: string } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        const subs = subjectsByClass.get(classId) ?? [];
        if (!subs.some((x) => x.id === r.subject_id)) subs.push({ id: r.subject_id, name: r.matieres?.name ?? "Matière" });
        subjectsByClass.set(classId, subs);
        if (!byClass.has(classId)) byClass.set(classId, { classId, className: r.classes?.name ?? "Classe", gradeLevel: r.classes?.grade_level ?? null });
      }
      const list = [...byClass.values()];
      const ordered = sortClassesByProgression(list.map((c) => ({ id: c.classId, name: c.className, grade_level: c.gradeLevel })))
        .map((s) => list.find((c) => c.classId === s.id)!)
        .filter(Boolean);
      if (ordered.length === 0) return [] as ClassRow[];
      const classIds = ordered.map((c) => c.classId);

      const { data: evals, error: evalError } = await supabase
        .from("evaluations")
        .select("id, class_section_id, subject_id, period_label, type, eval_date, title, description, max_score, admin_confirmed, matieres(name)")
        .eq("teacher_id", user!.id)
        .in("class_section_id", classIds)
        .order("eval_date", { ascending: false, nullsFirst: true });
      if (evalError) throw evalError;
      const rows = (evals ?? []) as unknown as {
        id: string;
        class_section_id: string;
        subject_id: string;
        period_label: string;
        type: EvaluationType;
        eval_date: string | null;
        title: string;
        description: string | null;
        max_score: number;
        admin_confirmed: boolean;
        matieres: { name: string } | null;
      }[];

      const graded = new Map<string, number>();
      const ids = rows.map((r) => r.id);
      for (let from = 0; ids.length > 0; from += 1000) {
        const { data: notes } = await supabase.from("notes").select("evaluation_id").in("evaluation_id", ids).range(from, from + 999);
        for (const n of (notes ?? []) as { evaluation_id: string | null }[]) {
          if (n.evaluation_id) graded.set(n.evaluation_id, (graded.get(n.evaluation_id) ?? 0) + 1);
        }
        if (!notes || notes.length < 1000) break;
      }

      const roster = new Map<string, number>();
      const { data: insc } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .in("class_section_id", classIds)
        .eq("status", "active")
        .limit(5000);
      for (const row of (insc ?? []) as { class_section_id: string }[]) {
        roster.set(row.class_section_id, (roster.get(row.class_section_id) ?? 0) + 1);
      }

      return ordered.map((c): ClassRow => {
        const r = roster.get(c.classId) ?? 0;
        const evs: EvalRow[] = rows
          .filter((e) => e.class_section_id === c.classId)
          .map((e) => ({
            id: e.id,
            classId: e.class_section_id,
            subjectId: e.subject_id,
            subjectName: e.matieres?.name ?? "Matière",
            period: e.period_label,
            type: e.type,
            date: e.eval_date,
            title: e.title,
            description: e.description,
            maxScore: Number(e.max_score) || 20,
            confirmed: !!e.admin_confirmed,
            graded: graded.get(e.id) ?? 0,
          }));
        return {
          ...c,
          roster: r,
          evals: evs,
          toGrade: evs.filter((e) => !isComplete(e, r)).length,
          subjects: subjectsByClass.get(c.classId) ?? [],
        };
      });
    },
  });

  const selectedId = params.get("classe") ?? classes[0]?.classId ?? "";
  const trimester = params.get("trimestre") ?? "";
  const setParam = (key: "classe" | "trimestre", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const selected = classes.find((c) => c.classId === selectedId) ?? null;
  const totals = useMemo(
    () => ({
      evals: classes.reduce((n, c) => n + c.evals.length, 0),
      toGrade: classes.reduce((n, c) => n + c.toGrade, 0),
      pending: classes.reduce((n, c) => n + c.evals.filter((e) => e.type === "examen" && !e.confirmed).length, 0),
    }),
    [classes],
  );

  // evaluations of the selected class, newest trimester first
  const periods = useMemo(
    () => [...new Set((selected?.evals ?? []).map((e) => e.period))].sort((a, b) => a.localeCompare(b, "fr")),
    [selected],
  );
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { suggested } = useResolvedGradingPeriod(TRIMESTER_PERIODS, { classSectionId: selected?.classId });
  const [form, setForm] = useState<{ evaluation: EditableEvaluation | null; type: EvaluationType } | null>(null);
  // ?nouveau=interrogation (from the lesson screen) opens the popup straight away
  const wantsNew = params.get("nouveau");
  useEffect(() => {
    if (!wantsNew || !selected) return;
    setForm({ evaluation: null, type: wantsNew === "interrogation" ? "interrogation" : "devoir" });
    const next = new URLSearchParams(params);
    next.delete("nouveau");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, selected?.classId]);

  const remove = async (e: EvalRow) => {
    if (e.graded > 0 && !window.confirm(`« ${e.title} » a déjà ${e.graded} note(s). Supprimer l’évaluation et ses notes ?`)) return;
    if (e.graded === 0 && !window.confirm(`Supprimer « ${e.title} » ?`)) return;
    const { error } = await supabase.from("evaluations").delete().eq("id", e.id);
    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success("Évaluation supprimée");
    for (const key of ["teacher-mes-devoirs", "teacher-todo", "lesson-evaluations", "mes-devoirs", "student-home", "evaluations"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

  // a trimester the selected class has no evaluation in falls back to « Tous »
  const activeTrimester = periods.includes(trimester) ? trimester : "";
  const byPeriod = useMemo(() => {
    const map = new Map<string, EvalRow[]>();
    for (const e of selected?.evals ?? []) {
      if (activeTrimester && e.period !== activeTrimester) continue;
      map.set(e.period, [...(map.get(e.period) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0], "fr"));
  }, [selected, activeTrimester]);



  return (
    <div>
      {openedFromLink ? <BackLink to="/mes-classes" label="Mes classes" /> : null}
      <PageBanner
        title="Devoirs & évaluations"
        subtitle="Interrogations, exercices de maison et examens de vos classes, avec les notes à saisir."
        stats={[
          { label: "Évaluations", value: String(totals.evals), hint: "dans vos classes" },
          { label: "À noter", value: String(totals.toGrade), hint: totals.toGrade ? "notes incomplètes" : "tout est noté" },
          { label: "Examens", value: String(totals.pending), hint: "en attente de confirmation" },
        ]}
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <div className="grid gap-6 lg:h-[calc(100dvh-22rem)] lg:min-h-[360px] lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* ── Classes ── */}
          <Card className="flex min-h-0 flex-col p-0">
            <p className="shrink-0 border-b border-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-[var(--border)]">
              Classes
            </p>
            <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {classes.map((c) => {
                const active = c.classId === selectedId;
                return (
                  <button
                    key={c.classId}
                    type="button"
                    onClick={() => setParam("classe", c.classId)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition",
                      active ? "bg-brand-50 dark:bg-brand-950/40" : "hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <ClassColorDot id={c.classId} name={c.className} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{c.className}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {c.evals.length} évaluation{c.evals.length > 1 ? "s" : ""}
                      </span>
                    </span>
                    {c.toGrade > 0 ? (
                      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800" title="Évaluations à noter">
                        {c.toGrade}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* ── Evaluations of the class ── */}
          <Card className="flex min-h-0 flex-col p-0">
            {selected ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-[var(--border)]">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-slate-900 dark:text-slate-50">{selected.className}</h2>
                    <p className="text-xs text-slate-500">
                      {selected.roster} élèves · {selected.evals.length} évaluation{selected.evals.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  {periods.length > 1 ? (
                    <div className="inline-flex rounded-md bg-slate-100 p-0.5 dark:bg-[var(--surface-2)]" role="group" aria-label="Trimestre">
                      {["", ...periods].map((p) => {
                        const active = activeTrimester === p;
                        const n = p ? (selected?.evals ?? []).filter((e) => e.period === p).length : selected?.evals.length ?? 0;
                        return (
                          <button
                            key={p || "tous"}
                            type="button"
                            onClick={() => setParam("trimestre", p)}
                            aria-pressed={active}
                            className={cn(
                              "inline-flex items-center rounded px-2.5 py-1.5 text-xs font-semibold transition",
                              active
                                ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                                : "text-slate-500 hover:text-slate-800",
                            )}
                          >
                            {p || "Tous"}
                            <span
                              className={cn(
                                "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold tabular-nums",
                                active
                                  ? "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-100"
                                  : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
                              )}
                              aria-label={`${n} évaluation${n > 1 ? "s" : ""}`}
                            >
                              {n}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setForm({ evaluation: null, type: "interrogation" })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white transition hover:bg-brand-800"
                  >
                    <Plus className="h-4 w-4" />
                    Nouvelle évaluation
                  </button>
                </div>
                {selected.evals.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <ClipboardList className="h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">Aucune évaluation dans cette classe pour le moment.</p>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {byPeriod.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-slate-500">Aucune évaluation pour ce trimestre.</p>
                    ) : null}
                    {byPeriod.map(([period, list]) => (
                      <section key={period} className="px-5 pt-4 last:pb-4">
                        {/* a section title, like the sidebar: teal caps, count and a rule */}
                        <div className="sticky top-0 z-10 -mx-5 flex select-none items-center gap-2 bg-white/95 px-5 py-1.5 backdrop-blur dark:bg-[var(--surface)]/95">
                          <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-700/80 dark:text-brand-300/80">
                            {period}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400">
                            · {list.length} évaluation{list.length > 1 ? "s" : ""}
                          </span>
                          <span className="h-px flex-1 bg-slate-200 dark:bg-[var(--border)]" />
                        </div>
                        <ul className="ml-1 mt-1 divide-y divide-slate-100 border-l-2 border-slate-200 dark:divide-[var(--border)] dark:border-[var(--border)]">
                          {list.map((e) => {
                            const complete = isComplete(e, selected.roster);
                            const pct = selected.roster ? Math.min(100, Math.round((e.graded / selected.roster) * 100)) : 0;
                            return (
                              <li key={e.id} className="flex flex-wrap items-center gap-4 py-3 pl-4">
                                <span className={cn("w-32 shrink-0 rounded-md px-2 py-1 text-center text-[11px] font-bold", TYPE_STYLE[e.type])}>
                                  {evaluationTypeLabel(e.type)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.title}</p>
                                  <p className="text-xs text-slate-500">
                                    {e.subjectName}
                                    {e.date ? ` · ${formatDateSafe(e.date, "EEE d MMM", { locale: fr })}` : " · sans date"}
                                    {e.type === "examen" ? (
                                      <span className={cn("ml-1.5 font-semibold", e.confirmed ? "text-emerald-700" : "text-amber-700")}>
                                        · {e.confirmed ? "confirmé" : "en attente de confirmation"}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                                <div className="w-36 shrink-0">
                                  <div className="flex justify-between text-[11px] font-semibold">
                                    <span className={complete ? "text-emerald-700" : "text-slate-600 dark:text-slate-300"}>
                                      {e.graded}/{selected.roster} notes
                                    </span>
                                    <span className="text-slate-400">{pct} %</span>
                                  </div>
                                  <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-slate-100 dark:bg-[var(--surface-2)]">
                                    <div className={cn("h-full rounded-sm", complete ? "bg-emerald-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                {e.type === "interrogation" || e.type === "devoir" ? (
                                  <div className="flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      title="Modifier"
                                      aria-label={`Modifier ${e.title}`}
                                      onClick={() =>
                                        setForm({
                                          type: e.type,
                                          evaluation: {
                                            id: e.id,
                                            subjectId: e.subjectId,
                                            period: e.period,
                                            type: e.type,
                                            title: e.title,
                                            description: e.description,
                                            maxScore: e.maxScore,
                                            date: e.date,
                                          },
                                        })
                                      }
                                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-[var(--surface-2)]"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Supprimer"
                                      aria-label={`Supprimer ${e.title}`}
                                      onClick={() => void remove(e)}
                                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="w-[4.25rem] shrink-0" aria-hidden />
                                )}
                                <Link
                                  to={`/classes/${e.classId}/notes/${e.id}?from=devoirs`}
                                  className={cn(
                                    "inline-flex h-8 w-32 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition",
                                    complete
                                      ? "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[var(--border)] dark:text-slate-200"
                                      : "bg-brand-700 text-white hover:bg-brand-800",
                                  )}
                                >
                                  {complete ? "Voir les notes" : "Saisir les notes"}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </Card>
        </div>
      )}

      {selected ? (
        <EvaluationFormModal
          open={!!form}
          onClose={() => setForm(null)}
          classId={selected.classId}
          className={selected.className}
          subjects={selected.subjects}
          defaultSubjectId={params.get("matiere") ?? selected.subjects[0]?.id}
          defaultPeriod={activeTrimester || suggested || TRIMESTER_PERIODS[0]}
          defaultType={form?.type ?? "devoir"}
          evaluation={form?.evaluation ?? null}
          onSaved={(id, created, type) => {
            // a new quiz goes straight to its grade sheet; homework is usually not graded
            if (created && type === "interrogation") navigate(`/classes/${selected.classId}/notes/${id}?from=devoirs`);
          }}
        />
      ) : null}
    </div>
  );
}
