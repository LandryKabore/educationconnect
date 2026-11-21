import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { BookOpenCheck, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useResolvedGradingPeriod } from "@/hooks/useGradingPeriodState";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ClassColorDot } from "@/components/ClassColor";
import { EvaluationFormModal, type EditableEvaluation } from "@/components/EvaluationFormModal";
import { Modal } from "@/components/Modal";
import { PageBanner } from "@/components/PageBanner";
import { Button, Card, DateInputFr, EmptyState, Label, Textarea } from "@/components/ui";

/** One homework item, whether created as an exercise or written in a lesson. */
type Homework = {
  key: string;
  source: "exercise" | "lesson";
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  title: string;
  details: string | null;
  due: string | null;
  given: string;
  /** exercise only */
  period?: string;
  maxScore?: number;
  graded?: number;
  /** lesson only */
  slotId?: string | null;
  hasContent?: boolean;
};

type ClassRow = { classId: string; className: string; subjects: { id: string; name: string }[]; roster: number };

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const dayLabel = (d: string) => format(new Date(`${d}T12:00:00`), "EEE d MMM", { locale: fr });

/** Teacher: the exercices de maison of each class (from lessons and exercises), with due dates. */
export default function ExercicesMaison() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const today = iso(new Date());
  const view = params.get("vue") === "passes" ? "past" : "upcoming";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["teacher-exercices", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, subject_id, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", user!.id);
      if (error) throw error;
      const byClass = new Map<string, ClassRow & { gradeLevel: string | null }>();
      for (const row of aff ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          subject_id: string;
          classes: { id: string; name: string; grade_level: string | null } | null;
          matieres: { name: string } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        const c = byClass.get(classId) ?? { classId, className: r.classes?.name ?? "Classe", gradeLevel: r.classes?.grade_level ?? null, subjects: [], roster: 0 };
        if (!c.subjects.some((x) => x.id === r.subject_id)) c.subjects.push({ id: r.subject_id, name: r.matieres?.name ?? "Matière" });
        byClass.set(classId, c);
      }
      const classes = sortClassesByProgression([...byClass.values()].map((c) => ({ id: c.classId, name: c.className, grade_level: c.gradeLevel })))
        .map((c) => byClass.get(c.id)!)
        .filter(Boolean);
      const classIds = classes.map((c) => c.classId);
      if (classIds.length === 0) return { classes: [] as ClassRow[], items: [] as Homework[] };

      const [evRes, cahierRes, inscRes] = await Promise.all([
        supabase
          .from("evaluations")
          .select("id, class_section_id, subject_id, period_label, title, description, max_score, eval_date, created_at, matieres(name)")
          .eq("teacher_id", user!.id)
          .eq("type", "devoir")
          .in("class_section_id", classIds),
        supabase
          .from("cahier_entrees")
          .select("id, class_section_id, subject_id, creneau_id, entry_date, content, homework, homework_due, matieres(name)")
          .eq("teacher_id", user!.id)
          .not("homework", "is", null)
          .order("entry_date", { ascending: false })
          .limit(500),
        supabase.from("inscriptions").select("class_section_id").in("class_section_id", classIds).eq("status", "active").limit(5000),
      ]);
      if (evRes.error) throw evRes.error;
      if (cahierRes.error) throw cahierRes.error;
      for (const r of (inscRes.data ?? []) as { class_section_id: string }[]) {
        const c = byClass.get(r.class_section_id);
        if (c) c.roster += 1;
      }

      const evals = (evRes.data ?? []) as unknown as {
        id: string;
        class_section_id: string;
        subject_id: string;
        period_label: string;
        title: string;
        description: string | null;
        max_score: number;
        eval_date: string | null;
        created_at: string;
        matieres: { name: string } | null;
      }[];
      const graded: Record<string, number> = {};
      if (evals.length) {
        const { data: notes } = await supabase.from("notes").select("evaluation_id").in("evaluation_id", evals.map((e) => e.id)).limit(10000);
        for (const n of (notes ?? []) as { evaluation_id: string }[]) graded[n.evaluation_id] = (graded[n.evaluation_id] ?? 0) + 1;
      }

      const items: Homework[] = [
        ...evals.map((e) => ({
          key: `e-${e.id}`,
          source: "exercise" as const,
          id: e.id,
          classId: e.class_section_id,
          subjectId: e.subject_id,
          subjectName: e.matieres?.name ?? "Matière",
          title: e.title,
          details: e.description,
          due: e.eval_date,
          given: e.created_at.slice(0, 10),
          period: e.period_label,
          maxScore: Number(e.max_score) || 20,
          graded: graded[e.id] ?? 0,
        })),
        ...((cahierRes.data ?? []) as unknown as {
          id: string;
          class_section_id: string;
          subject_id: string;
          creneau_id: string | null;
          entry_date: string;
          content: string | null;
          homework: string;
          homework_due: string | null;
          matieres: { name: string } | null;
        }[])
          .filter((r) => r.homework?.trim() && classIds.includes(r.class_section_id))
          .map((r) => ({
            key: `c-${r.id}`,
            source: "lesson" as const,
            id: r.id,
            classId: r.class_section_id,
            subjectId: r.subject_id,
            subjectName: r.matieres?.name ?? "Matière",
            title: r.homework.trim(),
            details: null,
            due: r.homework_due,
            given: r.entry_date,
            slotId: r.creneau_id,
            hasContent: !!r.content?.trim(),
          })),
      ];
      return { classes: classes.map(({ classId, className, subjects, roster }) => ({ classId, className, subjects, roster })), items };
    },
  });

  const classes = useMemo(() => data?.classes ?? [], [data]);
  const items = useMemo(() => data?.items ?? [], [data]);
  const selectedId = params.get("classe") ?? classes[0]?.classId ?? "";
  const selected = classes.find((c) => c.classId === selectedId) ?? null;
  const isUpcoming = (h: Homework) => !h.due || h.due >= today;
  const classItems = items.filter((h) => h.classId === selectedId);
  const upcomingCount = classItems.filter(isUpcoming).length;
  const shown = classItems
    .filter((h) => (view === "upcoming" ? isUpcoming(h) : !isUpcoming(h)))
    .sort((a, b) =>
      view === "upcoming"
        ? (a.due ?? "9999").localeCompare(b.due ?? "9999")
        : (b.due ?? "").localeCompare(a.due ?? ""),
    );

  const { suggested } = useResolvedGradingPeriod(TRIMESTER_PERIODS, { classSectionId: selected?.classId });
  const [form, setForm] = useState<{ evaluation: EditableEvaluation | null } | null>(null);
  const [lessonEdit, setLessonEdit] = useState<Homework | null>(null);

  // ?nouveau=1 opens the popup straight away
  const wantsNew = params.get("nouveau");
  useEffect(() => {
    if (!wantsNew || !selected) return;
    setForm({ evaluation: null });
    setParam("nouveau", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, selected?.classId]);

  const refresh = () => {
    for (const key of ["teacher-exercices", "teacher-mes-devoirs", "mes-devoirs", "enfant-devoirs", "cahier-lesson", "cahier-feed", "devoirs-demain", "teacher-lessons", "student-home"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const remove = async (h: Homework) => {
    if (!window.confirm(h.source === "lesson" ? "Retirer ce travail du cahier de textes ?" : `Supprimer « ${h.title} » ?`)) return;
    // lesson homework: keep the lesson notes, drop only the homework (or the whole entry if it had nothing else)
    const { error } =
      h.source === "lesson"
        ? h.hasContent
          ? await supabase.from("cahier_entrees").update({ homework: null, homework_due: null }).eq("id", h.id)
          : await supabase.from("cahier_entrees").delete().eq("id", h.id)
        : await supabase.from("evaluations").delete().eq("id", h.id);
    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success("Exercice retiré");
    refresh();
  };

  const totalUpcoming = items.filter(isUpcoming).length;
  const dueSoon = items.filter((h) => h.due && h.due >= today && differenceInCalendarDays(new Date(`${h.due}T12:00:00`), new Date()) <= 2).length;

  return (
    <div>
      <PageBanner
        title="Exercices de maison"
        subtitle="Le travail à faire à la maison et sa date. Les élèves et les parents le voient avec un compte à rebours."
        stats={[
          { label: "À venir", value: String(totalUpcoming), hint: "dans vos classes" },
          { label: "Bientôt", value: String(dueSoon), hint: "à rendre sous 2 jours" },
          { label: "Classes", value: String(classes.length), hint: "où vous enseignez" },
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
                const n = items.filter((h) => h.classId === c.classId && isUpcoming(h)).length;
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
                      <span className="block truncate text-[11px] text-slate-500">{c.subjects.map((s) => s.name).join(", ")}</span>
                    </span>
                    {n ? (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200" title="Exercices à venir">
                        {n}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* ── Homework of the class ── */}
          <Card className="flex min-h-0 flex-col p-0">
            {selected ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-[var(--border)]">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-slate-900 dark:text-slate-50">{selected.className}</h2>
                    <p className="text-xs text-slate-500">
                      {selected.roster} élèves · {classItems.length} exercice{classItems.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="inline-flex rounded-md bg-slate-100 p-0.5 dark:bg-[var(--surface-2)]" role="group" aria-label="Période">
                    {(
                      [
                        ["upcoming", "À venir", upcomingCount],
                        ["past", "Passés", classItems.length - upcomingCount],
                      ] as const
                    ).map(([key, label, n]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setParam("vue", key === "past" ? "passes" : "")}
                        aria-pressed={view === key}
                        className={cn(
                          "inline-flex items-center rounded px-2.5 py-1.5 text-xs font-semibold transition",
                          view === key ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200" : "text-slate-500 hover:text-slate-800",
                        )}
                      >
                        {label}
                        <span
                          className={cn(
                            "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold",
                            view === key ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
                          )}
                        >
                          {n}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ evaluation: null })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white transition hover:bg-brand-800"
                  >
                    <Plus className="h-4 w-4" />
                    Nouvel exercice
                  </button>
                </div>

                {shown.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <BookOpenCheck className="h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">
                      {view === "upcoming" ? "Aucun exercice à venir pour cette classe." : "Aucun exercice passé."}
                    </p>
                  </div>
                ) : (
                  <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-[var(--border)]">
                    {shown.map((h) => (
                      <HomeworkRow
                        key={h.key}
                        h={h}
                        roster={selected.roster}
                        today={today}
                        onEdit={() =>
                          h.source === "lesson"
                            ? setLessonEdit(h)
                            : setForm({
                                evaluation: {
                                  id: h.id,
                                  subjectId: h.subjectId,
                                  period: h.period ?? TRIMESTER_PERIODS[0],
                                  type: "devoir",
                                  title: h.title,
                                  description: h.details,
                                  maxScore: h.maxScore ?? 20,
                                  date: h.due,
                                },
                              })
                        }
                        onRemove={() => void remove(h)}
                      />
                    ))}
                  </ul>
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
          defaultPeriod={suggested || TRIMESTER_PERIODS[0]}
          defaultType="devoir"
          evaluation={form?.evaluation ?? null}
          onSaved={() => refresh()}
        />
      ) : null}
      <LessonHomeworkModal item={lessonEdit} onClose={() => setLessonEdit(null)} onSaved={refresh} />
    </div>
  );
}

function HomeworkRow({
  h,
  roster,
  today,
  onEdit,
  onRemove,
}: {
  h: Homework;
  roster: number;
  today: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const days = h.due ? differenceInCalendarDays(new Date(`${h.due}T12:00:00`), new Date(`${today}T12:00:00`)) : null;
  const countdown =
    days === null ? "Sans date" : days < 0 ? `Il y a ${-days} j` : days === 0 ? "Aujourd’hui" : days === 1 ? "Demain" : `Dans ${days} jours`;
  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-3">
      {/* due date block */}
      <div
        className={cn(
          "flex w-16 shrink-0 flex-col items-center rounded-md py-1.5 text-center",
          days !== null && days >= 0 && days <= 1 ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700 dark:bg-[var(--surface-2)] dark:text-slate-200",
        )}
      >
        {h.due ? (
          <>
            <span className="text-lg font-bold leading-none tabular-nums">{format(new Date(`${h.due}T12:00:00`), "d")}</span>
            <span className="text-[10px] font-semibold uppercase">{format(new Date(`${h.due}T12:00:00`), "MMM", { locale: fr })}</span>
          </>
        ) : (
          <CalendarClock className="my-1 h-5 w-5 text-slate-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{h.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {h.subjectName} ·{" "}
          {h.source === "lesson" ? `donné en cours le ${dayLabel(h.given)}` : `exercice créé le ${dayLabel(h.given)}`}
          {h.source === "exercise" && h.graded ? ` · ${h.graded}/${roster} notes` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md px-2 py-1 text-xs font-bold",
          days === null ? "bg-slate-100 text-slate-500" : days < 0 ? "bg-slate-100 text-slate-500" : days <= 1 ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700",
        )}
      >
        {countdown}
      </span>
      <div className="flex shrink-0 gap-1">
        {h.source === "exercise" ? (
          <Link
            to={`/classes/${h.classId}/notes/${h.id}?from=devoirs`}
            className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-[var(--border)] dark:text-slate-200"
            title="Noter cet exercice (facultatif)"
          >
            Noter
          </Link>
        ) : null}
        <button
          type="button"
          title="Modifier"
          aria-label={`Modifier ${h.title}`}
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-[var(--surface-2)]"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Supprimer"
          aria-label={`Supprimer ${h.title}`}
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/** Edit the « travail à faire » of a lesson (text and due date), without touching the lesson content. */
function LessonHomeworkModal({ item, onClose, onSaved }: { item: Homework | null; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setText(item?.title ?? "");
    setDue(item?.due ?? "");
  }, [item]);

  const save = async () => {
    if (!item) return;
    if (!text.trim()) return toast.error("Écrivez le travail à faire");
    if (due && due < item.given) return toast.error("La date de rendu ne peut pas être avant le cours");
    setSaving(true);
    const { error } = await supabase.from("cahier_entrees").update({ homework: text.trim(), homework_due: due || null }).eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message || "Enregistrement impossible");
    toast.success("Exercice modifié");
    onSaved();
    onClose();
  };

  return (
    <Modal open={!!item} title="Modifier l’exercice" onClose={onClose} closeDisabled={saving} className="rounded-lg">
      {item ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {item.subjectName} · donné en cours le {dayLabel(item.given)}
          </p>
          <div>
            <Label htmlFor="hw-text">Travail à faire</Label>
            <Textarea id="hw-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          </div>
          <div>
            <Label>Pour quand ?</Label>
            <DateInputFr value={due} onChange={setDue} minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear() + 1} />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
