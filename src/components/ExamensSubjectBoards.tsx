import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, Check, ChevronRight, Clock } from "lucide-react";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useGradingPeriodState } from "@/hooks/useGradingPeriodState";
import { EmptyState, PageLoadingState } from "@/components/ui";
import type { DevoirListItem } from "@/components/DevoirsClearList";
import { timeFr } from "@/lib/timetableLayout";

/** Burkina pattern: 3 examens par matière et par trimestre. */
export const PLANNED_EXAMS = 3;

export type ExamScore = { score: number | null; max: number | null; absent: boolean };

type Props = {
  items: DevoirListItem[];
  gradedIds: Set<string>;
  isLoading?: boolean;
  emptyMessage: string;
  /** where the grades are (Notes page of the student / the child) */
  notesHref: string;
};

export function normalizePeriod(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "Sans trimestre";
  const lower = t.toLowerCase();
  for (const name of TRIMESTER_PERIODS) {
    const n = name.slice(-1);
    if (lower.includes(`trimestre ${n}`) || lower === `t${n}` || lower.startsWith(`t${n} `)) return name;
  }
  return t;
}

const todayIso = () => format(new Date(), "yyyy-MM-dd");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const shortDate = (d: string) => format(new Date(`${d}T12:00:00`), "EEE d MMM", { locale: fr });

function daysUntil(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const t = new Date();
  return Math.round((new Date(y!, m! - 1, d!).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86_400_000);
}

/**
 * Examens = the planning: what is coming (date, time) and, per subject, how many of the 3 exams of the
 * trimester are done. The grades themselves are on the Notes page (linked), not repeated here.
 */
export function ExamensSubjectBoards({ items, gradedIds, isLoading, emptyMessage, notesHref }: Props) {
  const { schoolId } = useAuth();
  const { period, selectPeriod } = useGradingPeriodState(TRIMESTER_PERIODS, { schoolId });
  const today = todayIso();

  const isDone = (e: DevoirListItem) => gradedIds.has(e.id) || (!!e.eval_date && e.eval_date < today);

  const perPeriod = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const it of items) {
      const p = normalizePeriod(it.period_label);
      const c = m.get(p) ?? { total: 0, done: 0 };
      c.total += 1;
      if (gradedIds.has(it.id) || (!!it.eval_date && it.eval_date < today)) c.done += 1;
      m.set(p, c);
    }
    return m;
  }, [items, gradedIds, today]);

  // upcoming exams, every trimester (the soonest first)
  const upcoming = useMemo(
    () =>
      items
        .filter((e) => !gradedIds.has(e.id) && (e.eval_date ?? "") >= today)
        .sort((a, b) => (a.eval_date ?? "").localeCompare(b.eval_date ?? "") || (a.start_time ?? "").localeCompare(b.start_time ?? "")),
    [items, gradedIds, today],
  );

  const subjects = useMemo(() => {
    const allNames = [...new Set(items.map((e) => e.matieres?.name?.trim() || "Matière"))];
    return allNames
      .map((subject) => {
        const exams = items
          .filter((e) => normalizePeriod(e.period_label) === period && (e.matieres?.name?.trim() || "Matière") === subject)
          .sort((a, b) => (a.eval_date ?? "").localeCompare(b.eval_date ?? ""));
        return { subject, exams };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject, "fr"));
  }, [items, period]);

  if (isLoading) return <PageLoadingState message="Chargement des examens…" />;
  if (items.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="space-y-6">
      {/* coming up */}
      <section className="rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-[var(--border)]">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <CalendarClock className="h-4 w-4 text-brand-700 dark:text-brand-300" />
            Prochains examens
          </h2>
          <span className="text-xs text-slate-500">
            {upcoming.length ? `${upcoming.length} à venir` : "aucun de prévu"}
          </span>
        </header>
        {upcoming.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500">
            Aucun examen n’est encore programmé. Les dates apparaissent ici dès que l’établissement les confirme.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-[var(--border)]">
            {upcoming.slice(0, 8).map((e) => {
              const d = daysUntil(e.eval_date!);
              const date = new Date(`${e.eval_date}T12:00:00`);
              return (
                <li key={e.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-14 shrink-0 rounded-md bg-slate-50 py-1.5 text-center dark:bg-[var(--surface-2)]">
                    <p className="text-[10px] font-bold uppercase text-slate-500">{format(date, "EEE", { locale: fr })}</p>
                    <p className="text-lg font-bold leading-none text-slate-900 dark:text-slate-100">{format(date, "d")}</p>
                    <p className="text-[10px] text-slate-500">{format(date, "MMM", { locale: fr })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", subjectSwatch(e.matieres?.name).dot)} />
                      <span className="truncate">{e.matieres?.name ?? "Examen"}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="truncate">{e.title}</span>
                      {e.start_time ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeFr(e.start_time)}
                          {e.end_time ? ` – ${timeFr(e.end_time)}` : ""}
                        </span>
                      ) : null}
                      <span>· {normalizePeriod(e.period_label)}</span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-1 text-xs font-bold",
                      d <= 1
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        : d <= 7
                          ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300",
                    )}
                  >
                    {d === 0 ? "Aujourd’hui" : d === 1 ? "Demain" : `Dans ${d} jours`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* programme of the trimester */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Programme du trimestre</h2>
            <p className="text-xs text-slate-500">3 examens par matière. Les notes sont dans « Notes ».</p>
          </div>
          <Link
            to={notesHref}
            className="inline-flex items-center gap-1 rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Voir les notes <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div
          role="tablist"
          aria-label="Trimestre"
          className="grid grid-cols-3 gap-1 rounded-lg border border-brand-200 bg-brand-50/95 p-1 dark:border-[var(--border)] dark:bg-[var(--surface)]/95"
        >
          {TRIMESTER_PERIODS.map((p) => {
            const active = p === period;
            const c = perPeriod.get(p) ?? { total: 0, done: 0 };
            return (
              <button
                key={p}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => selectPeriod(p)}
                className={cn(
                  "rounded-md px-3 py-2 text-center transition",
                  active
                    ? "bg-brand-700 text-white shadow-sm"
                    : "text-brand-900 hover:bg-white dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
                )}
              >
                <span className="block text-sm font-bold">{p}</span>
                <span className={cn("block text-[11px]", active ? "text-white/80" : "text-slate-500")}>
                  {c.total === 0 ? "rien de publié" : c.done === c.total ? "tous passés" : `${c.done} passé${c.done > 1 ? "s" : ""} · ${c.total - c.done} à venir`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
                <th className="px-4 py-3">Matière</th>
                {Array.from({ length: PLANNED_EXAMS }, (_, i) => (
                  <th key={i} className="px-3 py-3 text-center">
                    Examen {i + 1}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Avancement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[var(--border)]">
              {subjects.map(({ subject, exams }) => {
                const done = exams.filter(isDone).length;
                return (
                  <tr key={subject}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", subjectSwatch(subject).dot)} />
                        {subject}
                      </span>
                    </td>
                    {Array.from({ length: PLANNED_EXAMS }, (_, i) => (
                      <td key={i} className="px-2 py-2">
                        <ExamCell exam={exams[i]} done={!!exams[i] && isDone(exams[i]!)} />
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <span className="flex gap-0.5">
                          {Array.from({ length: PLANNED_EXAMS }, (_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-2 w-4 rounded-sm",
                                i < done ? "bg-emerald-500" : i < exams.length ? "bg-amber-300" : "bg-slate-200 dark:bg-slate-700",
                              )}
                            />
                          ))}
                        </span>
                        <span className="w-8 text-right text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">
                          {done}/{PLANNED_EXAMS}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExamCell({ exam, done }: { exam: DevoirListItem | undefined; done: boolean }) {
  if (!exam) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-center dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-400">Prévu</p>
        <p className="text-[11px] text-slate-400">date pas encore publiée</p>
      </div>
    );
  }
  const date = exam.eval_date ? capitalize(shortDate(exam.eval_date)) : "Date à confirmer";
  const time = exam.start_time ? timeFr(exam.start_time) : null;
  if (done) {
    return (
      <div className="rounded-md bg-emerald-50/70 px-2 py-2 text-center dark:bg-emerald-500/10" title={exam.title}>
        <p className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800 dark:text-emerald-300">
          <Check className="h-3.5 w-3.5" />
          Passé
        </p>
        <p className="text-[11px] text-slate-500">{date}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md bg-amber-50 px-2 py-2 text-center dark:bg-amber-500/10" title={exam.title}>
      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{date}</p>
      <p className="text-[11px] text-slate-500">{time ? `à ${time}` : "heure à confirmer"}</p>
    </div>
  );
}
