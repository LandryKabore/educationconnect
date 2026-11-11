import { formatHoursFr, plannedMinutesBySubject } from "@/lib/timetableLayout";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";

type Slot = {
  subjectName: string;
  start_time: string;
  end_time: string;
};

export function TimetableHoursCard({
  slots,
  className,
}: {
  slots: Slot[];
  className?: string;
}) {
  const rows = plannedMinutesBySubject(slots);
  const max = rows.reduce((peak, row) => Math.max(peak, row.minutes), 1);
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);

  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]",
        className,
      )}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Heures par matière
        </h2>
        <p className="text-xs text-slate-500">
          {formatHoursFr(total)} planifiées
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune heure planifiée.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => {
            const swatch = subjectSwatch(row.name);
            const width = Math.max(6, Math.round((row.minutes / max) * 100));
            return (
              <li key={row.name} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2">
                <span className="truncate text-xs font-medium text-slate-700">
                  {row.name}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[var(--surface-2)]">
                  <span
                    className={cn("block h-full rounded-full", swatch.dot)}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-700">
                  {formatHoursFr(row.minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-snug text-slate-400">
        Heures posées sur la semaine, sans objectif.
      </p>
    </section>
  );
}
