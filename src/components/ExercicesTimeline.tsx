import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { BookOpenCheck, CheckCircle2, ChevronDown, NotebookPen } from "lucide-react";
import type { DevoirListItem } from "@/components/DevoirsClearList";
import type { ExamScore } from "@/components/ExamensSubjectBoards";
import { isLessonHomework } from "@/lib/homework";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";
import { EmptyState, PageLoadingState } from "@/components/ui";

type Tab = "todo" | "past" | "graded";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - today) / 86_400_000);
}

function groupLabel(date: string | null) {
  if (!date) return { title: "Sans date", hint: "à préparer quand le professeur le demande" };
  const d = daysUntil(date)!;
  const sameYear = date.slice(0, 4) === String(new Date().getFullYear());
  const long = capitalize(format(new Date(`${date}T12:00:00`), sameYear ? "EEEE d MMMM" : "EEEE d MMMM yyyy", { locale: fr }));
  if (d === 0) return { title: "Aujourd’hui", hint: long };
  if (d === 1) return { title: "Demain", hint: long };
  if (d === -1) return { title: "Hier", hint: long };
  if (d > 1 && d < 7) return { title: long, hint: `dans ${d} jours` };
  if (d < 0) return { title: long, hint: `il y a ${-d} jours` };
  return { title: long, hint: `dans ${d} jours` };
}

/** « Donné en cours le … » is stored at the end of the lesson homework description. */
function splitDescription(item: DevoirListItem) {
  const text = item.description?.trim() ?? "";
  const m = text.match(/(?:^|\n)(Donné en cours le .+)$/);
  return {
    body: m ? text.slice(0, m.index).trim() : text,
    given: m ? m[1] : null,
  };
}

/**
 * Exercices de maison as a timeline grouped by due day (Aujourd’hui, Demain, …), with a colour per subject.
 * Shared by the student and parent screens. Homework is not graded unless the teacher made it a graded exercise.
 */
export function ExercicesTimeline({
  items,
  gradedIds,
  scores = {},
  isLoading,
  forParent,
}: {
  items: DevoirListItem[];
  gradedIds: Set<string>;
  /** the grade of graded exercises */
  scores?: Record<string, ExamScore>;
  isLoading: boolean;
  forParent: boolean;
}) {
  const [tab, setTab] = useState<Tab>("todo");
  const [subject, setSubject] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const d = daysUntil(item.eval_date);
        const status: Tab = gradedIds.has(item.id) ? "graded" : d != null && d < 0 ? "past" : "todo";
        return { item, d, status };
      }),
    [items, gradedIds],
  );

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { todo: 0, past: 0, graded: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  // open a tab that has something
  useEffect(() => {
    if (!items.length || counts[tab] > 0) return;
    const next = (["todo", "past", "graded"] as const).find((k) => counts[k] > 0);
    if (next) setTab(next);
  }, [items.length, counts, tab]);

  const subjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows.filter((x) => x.status === tab)) {
      const n = r.item.matieres?.name ?? "Autre";
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [rows, tab]);

  useEffect(() => {
    if (subject && !subjects.some(([n]) => n === subject)) setSubject("");
  }, [subjects, subject]);

  const shown = rows
    .filter((r) => r.status === tab && (!subject || (r.item.matieres?.name ?? "Autre") === subject))
    .sort((a, b) =>
      tab === "todo"
        ? (a.item.eval_date ?? "9999").localeCompare(b.item.eval_date ?? "9999")
        : (b.item.eval_date ?? b.item.created_at ?? "").localeCompare(a.item.eval_date ?? a.item.created_at ?? "") ||
          (b.item.created_at ?? "").localeCompare(a.item.created_at ?? ""),
    );

  const groups = useMemo(() => {
    const out: { key: string; date: string | null; rows: typeof shown }[] = [];
    for (const r of shown) {
      const key = r.item.eval_date?.slice(0, 10) ?? "none";
      const g = out.find((x) => x.key === key);
      if (g) g.rows.push(r);
      else out.push({ key, date: r.item.eval_date?.slice(0, 10) ?? null, rows: [r] });
    }
    return out;
  }, [shown]);

  if (isLoading) return <PageLoadingState message="Chargement des exercices…" />;
  if (items.length === 0) return <EmptyState message="Aucun exercice de maison pour le moment." />;

  const tomorrow = iso(addDays(new Date(), 1));
  const TABS: { key: Tab; label: string }[] = [
    { key: "todo", label: "À faire" },
    { key: "past", label: "Date passée" },
    { key: "graded", label: "Notés" },
  ];

  return (
    // on wide screens the block fits the window: it sticks to the top and the list scrolls inside it
    <div className="grid gap-6 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:grid-cols-12">
      {/* filters */}
      <aside className="space-y-4 lg:col-span-3 lg:overflow-y-auto">
        <div className="rounded-md border border-slate-200 bg-white p-1.5 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center justify-between rounded px-3 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-brand-700 text-white"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "min-w-6 rounded px-1.5 py-0.5 text-center text-xs font-bold tabular-nums",
                    active ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300",
                  )}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        {subjects.length > 1 ? (
          <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-[var(--border)] dark:bg-[var(--surface)]">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Matières</p>
            <div className="flex flex-wrap gap-1.5 lg:flex-col">
              <SubjectChip label="Toutes" count={subjects.reduce((n, [, c]) => n + c, 0)} active={!subject} onClick={() => setSubject("")} />
              {subjects.map(([name, c]) => (
                <SubjectChip
                  key={name}
                  label={name}
                  count={c}
                  dot={subjectSwatch(name).dot}
                  active={subject === name}
                  onClick={() => setSubject(subject === name ? "" : name)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <p className="rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300">
          À préparer pour la classe : rien n’est à rendre en ligne. Si un exercice est noté, la note apparaît dans{" "}
          {forParent ? "« Notes »" : "« Mes notes »"}.
        </p>
      </aside>

      {/* timeline */}
      <div className="space-y-6 lg:col-span-9 lg:overflow-y-auto lg:pr-2">
        {groups.length === 0 ? (
          <EmptyState message="Aucun exercice dans cet onglet." />
        ) : (
          groups.map((g) => {
            const label = groupLabel(g.date);
            const urgent = tab === "todo" && g.date != null && g.date <= tomorrow;
            return (
              <section key={g.key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className={cn("text-sm font-extrabold uppercase tracking-wider", urgent ? "text-rose-700 dark:text-rose-400" : "text-slate-800 dark:text-slate-100")}>
                    {label.title}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {label.hint} · {g.rows.length} exercice{g.rows.length > 1 ? "s" : ""}
                  </span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-[var(--border)]" />
                </div>
                <ul className="space-y-2">
                  {g.rows.map(({ item, status }) => {
                    const sw = subjectSwatch(item.matieres?.name);
                    const { body, given } = splitDescription(item);
                    const fromLesson = isLessonHomework(item.id);
                    const fullText = fromLesson ? body || item.title : body;
                    const long = fromLesson ? fullText.length > item.title.length : !!body;
                    const expanded = open === item.id;
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "relative overflow-hidden rounded-md border border-slate-200 bg-white pl-4 dark:border-[var(--border)] dark:bg-[var(--surface)]",
                          status === "past" && "opacity-70",
                        )}
                      >
                        <span className={cn("absolute inset-y-0 left-0 w-1.5", sw.edge)} aria-hidden />
                        <button
                          type="button"
                          onClick={() => long && setOpen(expanded ? null : item.id)}
                          className={cn("flex w-full items-start gap-3 py-3 pr-4 text-left", long && "cursor-pointer")}
                          aria-expanded={long ? expanded : undefined}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                                <span className={cn("h-2 w-2 rounded-full", sw.dot)} />
                                {item.matieres?.name ?? "Matière"}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300">
                                {fromLesson ? <BookOpenCheck className="h-3 w-3" /> : <NotebookPen className="h-3 w-3" />}
                                {fromLesson ? "Donné en cours" : "Exercice"}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "mt-1 block font-semibold text-slate-900 dark:text-slate-100",
                                expanded ? "whitespace-pre-line" : "line-clamp-2",
                              )}
                            >
                              {expanded && fromLesson ? fullText : item.title}
                            </span>
                            {expanded && !fromLesson && body ? (
                              <span className="mt-1 block whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{body}</span>
                            ) : null}
                            {given ? <span className="mt-1 block text-xs text-slate-500">{given}</span> : null}
                            {long ? (
                              <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                                {expanded ? "Réduire" : "Voir tout"}
                                <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} />
                              </span>
                            ) : null}
                          </span>
                          <StatusChip status={status} date={item.eval_date} score={scores[item.id]} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function SubjectChip({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition lg:w-full",
        active
          ? "bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-600/30 dark:bg-brand-950/40 dark:text-brand-200"
          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
      )}
    >
      {dot ? <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums text-slate-400">{count}</span>
    </button>
  );
}

function StatusChip({ status, date, score }: { status: Tab; date: string | null; score?: ExamScore }) {
  if (status === "graded") {
    if (score?.absent) {
      return (
        <span className="shrink-0 rounded-md bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Absent
        </span>
      );
    }
    if (score?.score != null && score.max) {
      const v = (score.score / score.max) * 20;
      return (
        <span className="shrink-0 rounded-md bg-slate-50 px-2.5 py-1 text-right dark:bg-[var(--surface-2)]">
          <span
            className={cn(
              "text-lg font-bold tabular-nums",
              v >= 14 ? "text-emerald-700 dark:text-emerald-400" : v >= 10 ? "text-slate-900 dark:text-slate-100" : "text-rose-700 dark:text-rose-400",
            )}
          >
            {Number.isInteger(score.score) ? score.score : score.score.toFixed(1)}
          </span>
          <span className="text-xs font-semibold text-slate-400">/{score.max}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Noté
      </span>
    );
  }
  const d = daysUntil(date);
  if (d == null) return null;
  if (status === "past") {
    return (
      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300">
        Date passée
      </span>
    );
  }
  const text = d === 0 ? "Aujourd’hui" : d === 1 ? "Demain" : `J-${d}`;
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-1 text-xs font-bold tabular-nums",
        d <= 1
          ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          : d <= 3
            ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
            : "bg-slate-100 text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300",
      )}
    >
      {text}
    </span>
  );
}
