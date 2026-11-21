import { useMemo } from "react";
import { fr } from "date-fns/locale";
import { formatDateSafe } from "@/lib/dateFr";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";

export type CompositionTimetablePaper = {
  id: string;
  eval_date: string | null;
  start_time: string | null;
  end_time: string | null;
  matieres: { name: string } | null;
};

type Props = {
  papers: CompositionTimetablePaper[];
  className?: string;
  /** Compact cards (inside a session card). */
  compact?: boolean;
};

function hhmm(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function minutes(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Mini emploi du temps for a composition session:
 * days as columns, start times as rows, coloured subject cells.
 */
export function CompositionMiniTimetable({ papers, className, compact }: Props) {
  const { days, rows, cell } = useMemo(() => {
    const dated = papers.filter((p) => p.eval_date);
    const daySet = [...new Set(dated.map((p) => p.eval_date!))].sort();
    const startSet = [
      ...new Set(dated.map((p) => hhmm(p.start_time)).filter(Boolean)),
    ].sort((a, b) => minutes(a) - minutes(b));

    const map = new Map<string, CompositionTimetablePaper>();
    for (const p of dated) {
      const key = `${p.eval_date}|${hhmm(p.start_time)}`;
      // keep earliest end / first paper if collision
      if (!map.has(key)) map.set(key, p);
    }

    return {
      days: daySet,
      rows: startSet,
      cell: (day: string, start: string) => map.get(`${day}|${start}`) ?? null,
    };
  }, [papers]);

  if (days.length === 0 || rows.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
              <th
                className={cn(
                  "sticky left-0 z-10 bg-slate-50 px-2 font-semibold text-slate-500 dark:bg-[var(--surface-2)]",
                  compact ? "py-1.5 text-[10px]" : "py-2 text-xs",
                )}
              >
                Horaire
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  className={cn(
                    "px-2 text-center font-bold text-slate-800 dark:text-slate-100",
                    compact ? "py-1.5 text-[10px]" : "py-2 text-xs",
                  )}
                >
                  <span className="block capitalize">
                    {formatDateSafe(day, "EEE", { locale: fr })}
                  </span>
                  <span className="block font-semibold text-slate-500">
                    {formatDateSafe(day, "d MMM", { locale: fr })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((start) => (
              <tr key={start} className="border-b border-slate-100 last:border-0 dark:border-[var(--border)]">
                <th
                  className={cn(
                    "sticky left-0 z-10 bg-white px-2 font-semibold tabular-nums text-slate-500 dark:bg-[var(--surface)]",
                    compact ? "py-1.5 text-[10px]" : "py-2 text-xs",
                  )}
                >
                  {start}
                </th>
                {days.map((day) => {
                  const paper = cell(day, start);
                  if (!paper) {
                    return (
                      <td key={day} className={cn("px-1", compact ? "py-1" : "py-1.5")}>
                        <div
                          className={cn(
                            "rounded-md border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/20",
                            compact ? "min-h-9" : "min-h-12",
                          )}
                        />
                      </td>
                    );
                  }
                  const name = paper.matieres?.name ?? "Matière";
                  const swatch = subjectSwatch(name);
                  const end = hhmm(paper.end_time);
                  return (
                    <td key={day} className={cn("px-1", compact ? "py-1" : "py-1.5")}>
                      <div
                        className={cn(
                          "flex overflow-hidden rounded-md border shadow-sm",
                          swatch.card,
                        )}
                        title={`${name}${end ? ` · ${start}–${end}` : ""}`}
                      >
                        <span className={cn("w-1 shrink-0", swatch.edge)} aria-hidden />
                        <div className={cn("min-w-0 flex-1 px-2", compact ? "py-1" : "py-1.5")}>
                          <p
                            className={cn(
                              "truncate font-bold text-slate-900 dark:text-slate-50",
                              compact ? "text-[11px]" : "text-xs",
                            )}
                          >
                            {name}
                          </p>
                          {end ? (
                            <p
                              className={cn(
                                "tabular-nums text-slate-700/80 dark:text-slate-200/80",
                                compact ? "text-[9px]" : "text-[10px]",
                              )}
                            >
                              {start}–{end}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
