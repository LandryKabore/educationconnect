import type { VisibleTimetableConflict } from "@/lib/timetableConflicts";
import { cn } from "@/lib/utils";

const DAY_SHORT = ["", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

const TYPE_LABEL: Record<VisibleTimetableConflict["type"], string> = {
  class: "Classe",
  teacher: "Enseignant",
  room: "Salle",
};

function hhmm(value: string) {
  return value.slice(0, 5);
}

export function TimetableConflictsPanel({
  conflicts,
  onOpen,
  className,
}: {
  conflicts: VisibleTimetableConflict[];
  onOpen: (slotId: string) => void;
  className?: string;
}) {
  return (
    <section
      id="conflits-edt"
      className={cn(
        "scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]",
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-slate-900">
        Conflits ({conflicts.length})
      </h2>
      {conflicts.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Aucun conflit de classe, d’enseignant ou de salle sur cette vue.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
          {conflicts.map((conflict) => (
            <li key={conflict.key} className="flex items-start gap-3 py-2.5">
              <span className="mt-1 h-8 w-1 shrink-0 rounded-full bg-red-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {DAY_SHORT[conflict.day] ?? "Jour"}{" "}
                  {hhmm(conflict.startTime)}–{hhmm(conflict.endTime)}
                  <span className="font-medium text-slate-500">
                    {" "}
                    · {TYPE_LABEL[conflict.type]}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{conflict.message}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpen(conflict.slotId)}
                className="shrink-0 text-sm font-semibold text-brand-700 hover:underline"
              >
                Ouvrir
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
