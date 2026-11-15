import { useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock } from "lucide-react";
import { formatAverage, TRIMESTER_PERIODS } from "@/lib/averages";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useGradingPeriodState } from "@/hooks/useGradingPeriodState";
import { EmptyState, PageLoadingState } from "@/components/ui";
import type { DevoirListItem } from "@/components/DevoirsClearList";

/** Burkina pattern: 3 examens par matière et par trimestre. */
const PLANNED = 3;

export type ExamScore = { score: number | null; max: number | null; absent: boolean };

type Props = {
  items: DevoirListItem[];
  gradedIds: Set<string>;
  /** the child's grade per exam */
  scores?: Record<string, ExamScore>;
  isLoading?: boolean;
  emptyMessage: string;
};

function normalizePeriod(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "Sans trimestre";
  const lower = t.toLowerCase();
  for (const name of TRIMESTER_PERIODS) {
    const n = name.slice(-1);
    if (lower.includes(`trimestre ${n}`) || lower === `t${n}` || lower.startsWith(`t${n} `)) return name;
  }
  return t;
}

const on20 = (s: ExamScore | undefined) =>
  s && !s.absent && s.score != null && s.max ? (s.score / s.max) * 20 : null;

function tone(v: number | null) {
  if (v == null) return "text-slate-400";
  if (v >= 14) return "text-emerald-700 dark:text-emerald-400";
  if (v >= 10) return "text-slate-900 dark:text-slate-100";
  return "text-rose-700 dark:text-rose-400";
}

const todayIso = () => format(new Date(), "yyyy-MM-dd");
const shortDate = (d: string) => format(new Date(`${d}T12:00:00`), "EEE d MMM", { locale: fr });
const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Exams of one trimester as a table: one row per subject, the 3 exams side by side with the grade,
 * and the average of the exams. Opens on the current trimester.
 */
export function ExamensSubjectBoards({ items, gradedIds, scores = {}, isLoading, emptyMessage }: Props) {
  const { schoolId } = useAuth();
  const { period, selectPeriod } = useGradingPeriodState(TRIMESTER_PERIODS, { schoolId });

  const perPeriod = useMemo(() => {
    const m = new Map<string, { total: number; graded: number }>();
    for (const it of items) {
      const p = normalizePeriod(it.period_label);
      const c = m.get(p) ?? { total: 0, graded: 0 };
      c.total += 1;
      if (gradedIds.has(it.id)) c.graded += 1;
      m.set(p, c);
    }
    return m;
  }, [items, gradedIds]);

  const rows = useMemo(() => {
    const map = new Map<string, DevoirListItem[]>();
    for (const item of items) {
      if (normalizePeriod(item.period_label) !== period) continue;
      const name = item.matieres?.name?.trim() || "Matière";
      map.set(name, [...(map.get(name) ?? []), item]);
    }
    return [...map.entries()]
      .map(([subject, list]) => {
        const sorted = [...list].sort((a, b) => (a.eval_date ?? "").localeCompare(b.eval_date ?? ""));
        const vals = sorted.map((e) => on20(scores[e.id])).filter((v): v is number => v != null);
        return { subject, exams: sorted, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject, "fr"));
  }, [items, period, scores]);

  const upcoming = useMemo(
    () =>
      items
        .filter(
          (e) => normalizePeriod(e.period_label) === period && !gradedIds.has(e.id) && (e.eval_date ?? "") >= todayIso(),
        )
        .sort((a, b) => (a.eval_date ?? "").localeCompare(b.eval_date ?? "")),
    [items, period, gradedIds],
  );

  if (isLoading) return <PageLoadingState message="Chargement des examens…" />;
  if (items.length === 0) return <EmptyState message={emptyMessage} />;

  const allAvg = rows.map((r) => r.avg).filter((v): v is number => v != null);
  const periodAvg = allAvg.length ? allAvg.reduce((a, b) => a + b, 0) / allAvg.length : null;

  return (
    <div className="space-y-4">
      {/* trimester tabs */}
      <div
        role="tablist"
        aria-label="Trimestre"
        className="sticky top-0 z-20 grid grid-cols-3 gap-1 rounded-lg border border-brand-200 bg-brand-50/95 p-1 backdrop-blur dark:border-[var(--border)] dark:bg-[var(--surface)]/95"
      >
        {TRIMESTER_PERIODS.map((p) => {
          const active = p === period;
          const c = perPeriod.get(p) ?? { total: 0, graded: 0 };
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
                {c.total === 0 ? "aucun examen" : `${c.graded} noté${c.graded > 1 ? "s" : ""} sur ${c.total}`}
              </span>
            </button>
          );
        })}
      </div>

      {upcoming.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/5">
          <span className="inline-flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
            <CalendarClock className="h-4 w-4" />À venir
          </span>
          {upcoming.slice(0, 4).map((e) => (
            <span
              key={e.id}
              className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-800 ring-1 ring-amber-200 dark:bg-[var(--surface)] dark:text-slate-100 dark:ring-amber-500/30"
            >
              {e.matieres?.name ?? "Examen"} · {e.eval_date ? shortDate(e.eval_date) : "date à confirmer"}
              {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
            </span>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState message={`Aucun examen confirmé pour le ${period.toLowerCase()}.`} />
      ) : (
        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
                <th className="px-4 py-3">Matière</th>
                {Array.from({ length: PLANNED }, (_, i) => (
                  <th key={i} className="px-3 py-3 text-center">
                    Examen {i + 1}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Moyenne</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.subject}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", subjectSwatch(r.subject).dot)} />
                      {r.subject}
                    </span>
                  </td>
                  {Array.from({ length: PLANNED }, (_, i) => {
                    const e = r.exams[i];
                    return (
                      <td key={i} className="px-2 py-2">
                        <ExamCell exam={e} graded={!!e && gradedIds.has(e.id)} score={e ? scores[e.id] : undefined} />
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-lg font-bold tabular-nums", tone(r.avg))}>
                      {r.avg != null ? formatAverage(r.avg, 2) : "—"}
                    </span>
                    {r.avg != null ? <span className="text-xs text-slate-400">/20</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
            {periodAvg != null ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
                  <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200" colSpan={PLANNED + 1}>
                    Moyenne des examens · {period}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      sans coefficient, à titre indicatif (la moyenne officielle est dans Notes)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-lg font-bold tabular-nums", tone(periodAvg))}>
                      {formatAverage(periodAvg, 2)}
                    </span>
                    <span className="text-xs text-slate-400">/20</span>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </section>
      )}
    </div>
  );
}

function ExamCell({
  exam,
  graded,
  score,
}: {
  exam: DevoirListItem | undefined;
  graded: boolean;
  score: ExamScore | undefined;
}) {
  if (!exam) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-center dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-400">Prévu</p>
        <p className="text-[11px] text-slate-400">pas encore publié</p>
      </div>
    );
  }
  const date = exam.eval_date ? shortDate(exam.eval_date) : "date à confirmer";
  const time = exam.start_time ? exam.start_time.slice(0, 5) : null;
  const title = [exam.title, exam.eval_date ? date : null, time].filter(Boolean).join(" · ");

  if (graded && score?.absent) {
    return (
      <div className="rounded-md bg-rose-50 px-2 py-2 text-center dark:bg-rose-500/10" title={title}>
        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Absent</p>
        <p className="text-[11px] text-slate-500">{date}</p>
      </div>
    );
  }
  if (graded) {
    const v = on20(score);
    return (
      <div className="rounded-md bg-slate-50 px-2 py-2 text-center dark:bg-[var(--surface-2)]" title={title}>
        <p className={cn("text-lg font-bold leading-tight tabular-nums", tone(v))}>
          {score?.score != null ? fmtScore(score.score) : "✓"}
          {score?.max ? <span className="text-xs font-semibold text-slate-400">/{score.max}</span> : null}
        </p>
        <p className="text-[11px] text-slate-500">{date}</p>
      </div>
    );
  }
  const upcoming = (exam.eval_date ?? "9999") >= todayIso();
  return (
    <div
      className={cn(
        "rounded-md px-2 py-2 text-center",
        upcoming ? "bg-amber-50 dark:bg-amber-500/10" : "bg-slate-50 dark:bg-[var(--surface-2)]",
      )}
      title={title}
    >
      <p className={cn("text-sm font-bold", upcoming ? "text-amber-800 dark:text-amber-300" : "text-slate-500")}>
        {upcoming ? "À venir" : "En attente de note"}
      </p>
      <p className="text-[11px] text-slate-500">
        {date}
        {time ? ` · ${time}` : ""}
      </p>
    </div>
  );
}
