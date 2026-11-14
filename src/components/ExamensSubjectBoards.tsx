import { useMemo, useState } from "react";
import { fr } from "date-fns/locale";
import { isPast } from "date-fns";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { cn } from "@/lib/utils";
import { Badge, EmptyState, PageLoadingState } from "@/components/ui";
import type { DevoirListItem } from "@/components/DevoirsClearList";

const PLANNED = 3;

type Props = {
  items: DevoirListItem[];
  gradedIds: Set<string>;
  isLoading?: boolean;
  emptyMessage: string;
};

function normalizePeriod(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "Sans trimestre";
  const lower = t.toLowerCase();
  for (const name of TRIMESTER_PERIODS) {
    const n = name.slice(-1);
    if (lower.includes(`trimestre ${n}`) || lower === `t${n}` || lower.startsWith(`t${n} `)) {
      return name;
    }
  }
  return t;
}

function statusOf(item: DevoirListItem, graded: boolean) {
  if (graded) return { label: "Noté", tone: "success" as const };
  const dueAt = parseValidDate(
    item.eval_date?.length === 10 ? `${item.eval_date}T23:59:59` : item.eval_date,
  );
  if (dueAt && isPast(dueAt)) return { label: "Terminé", tone: "info" as const };
  return { label: "À venir", tone: "warning" as const };
}

/**
 * Student examens: every subject shows T1–T3 boards with up to 3 slots
 * (Burkina pattern — 3 examens par matière et par trimestre).
 */
export function ExamensSubjectBoards({ items, gradedIds, isLoading, emptyMessage }: Props) {
  const [period, setPeriod] = useState<string>(TRIMESTER_PERIODS[0]);

  const bySubject = useMemo(() => {
    const map = new Map<string, DevoirListItem[]>();
    for (const item of items) {
      if (normalizePeriod(item.period_label) !== period) continue;
      const name = item.matieres?.name?.trim() || "Matière";
      const list = map.get(name) ?? [];
      list.push(item);
      map.set(name, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.eval_date ?? "").localeCompare(b.eval_date ?? ""));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [items, period]);

  if (isLoading) {
    return <PageLoadingState message="Chargement des examens…" />;
  }
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        En général <span className="font-semibold text-slate-800 dark:text-slate-100">3 examens par matière</span> et
        par trimestre.
      </p>

      <div
        role="tablist"
        aria-label="Trimestre"
        className="sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-lg border border-brand-200 bg-brand-50/95 p-1 backdrop-blur dark:border-[var(--border)] dark:bg-[var(--surface)]/95"
      >
        {TRIMESTER_PERIODS.map((p) => {
          const active = p === period;
          const count = items.filter((it) => normalizePeriod(it.period_label) === p).length;
          return (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setPeriod(p)}
              className={cn(
                "min-w-16 flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition",
                active
                  ? "bg-brand-700 text-white shadow-sm"
                  : "text-brand-900 hover:bg-white dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
              )}
            >
              {p}
              <span className={cn("ml-1.5 text-xs tabular-nums", active ? "text-white/80" : "text-slate-500")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {bySubject.length === 0 ? (
        <EmptyState message={`Aucun examen confirmé pour ${period}.`} />
      ) : (
        <div className="space-y-5">
          {bySubject.map(([subject, rows]) => {
            const planned = PLANNED;
            const filled = Math.min(rows.length, planned);
            const complete = rows.length >= planned;
            return (
              <section key={subject} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{subject}</h2>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                      complete
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                    )}
                  >
                    {filled}/{planned}
                  </span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.slice(0, planned).map((item, index) => {
                    const graded = gradedIds.has(item.id);
                    const status = statusOf(item, graded);
                    const schedule = formatExamSchedule({
                      due_date: item.eval_date,
                      start_time: item.start_time,
                      end_time: item.end_time,
                    });
                    return (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-[var(--border)] dark:bg-[var(--surface)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Examen {index + 1}
                          </p>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <p className="mt-1.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs tabular-nums text-slate-500">
                          {item.eval_date
                            ? formatDateSafe(item.eval_date, "EEE d MMM yyyy", { locale: fr })
                            : "Date à confirmer"}
                          {schedule ? ` · ${schedule}` : ""}
                        </p>
                      </li>
                    );
                  })}
                  {Array.from({ length: Math.max(0, planned - rows.length) }, (_, offset) => {
                    const number = rows.length + offset + 1;
                    return (
                      <li
                        key={`ph-${subject}-${number}`}
                        className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3.5 dark:border-slate-600 dark:bg-[var(--surface-2)]"
                      >
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Examen {number}
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-slate-500">Prévu · {period}</p>
                        <p className="mt-1 text-xs text-slate-400">Pas encore publié</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
