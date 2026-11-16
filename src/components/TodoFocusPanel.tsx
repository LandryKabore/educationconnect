import { Link, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useChildUnjustifiedAbsences, useLowGrades } from "@/hooks/useParentHome";
import {
  LOW_GRADE_ON_20,
  LOW_GRADE_WINDOW_DAYS,
  TODO_WINDOW_DAYS,
  plural,
  scoreOn20,
  shortDateFr,
} from "@/lib/parentHome";
import { cn } from "@/lib/utils";

/** Query parameter set by the « Voir » buttons of the parent « À faire » banner. */
export const TODO_FOCUS_PARAM = "a-faire";

/**
 * Exact list behind an « À faire » count (grades under 8/20 of the last 14 days, or the
 * unjustified absences of the last 30 days), shown at the top of the Notes / Présences page
 * when the parent comes from « Voir ». Closing it removes the parameter.
 */
export function TodoFocusPanel({ childId, kind }: { childId: string | undefined; kind: "low-grades" | "absences" }) {
  const [params, setParams] = useSearchParams();
  const open = params.get(TODO_FOCUS_PARAM) === kind;
  const grades = useLowGrades(open && kind === "low-grades" ? childId : undefined);
  const absences = useChildUnjustifiedAbsences(open && kind === "absences" ? childId : undefined);
  if (!open || !childId) return null;

  const close = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(TODO_FOCUS_PARAM);
        return next;
      },
      { replace: true },
    );

  const isGrades = kind === "low-grades";
  const loading = isGrades ? grades.isLoading : absences.isLoading;
  const rows = isGrades ? (grades.data ?? []) : [];
  const absRows = isGrades ? [] : (absences.data ?? []);
  const count = isGrades ? rows.length : absRows.length;

  return (
    <section
      aria-label="À faire"
      className={cn(
        "mb-6 rounded-lg border p-4",
        isGrades
          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className={cn("text-base font-bold", isGrades ? "text-amber-900 dark:text-amber-200" : "text-rose-800 dark:text-rose-200")}>
            {loading
              ? "Chargement…"
              : isGrades
                ? `${count} ${plural(count, "note à retravailler", "notes à retravailler")}`
                : `${count} ${plural(count, "absence non justifiée", "absences non justifiées")}`}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {isGrades
              ? `Notes sous ${LOW_GRADE_ON_20}/20 ces ${LOW_GRADE_WINDOW_DAYS} derniers jours. Un petit coup de pouce à la maison aidera à remonter !`
              : `Ces ${TODO_WINDOW_DAYS} derniers jours, pas encore justifiées par l’école.`}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/70 hover:text-slate-800"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? null : count === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Rien à signaler.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-md bg-white dark:divide-white/10 dark:bg-[var(--surface)]">
          {isGrades
            ? rows.map((n) => {
                const v = scoreOn20(n.score, n.max_score);
                return (
                  <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{n.subject ?? "Matière"}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[n.title, shortDateFr(n.eval_date ?? n.created_at), n.period_label].filter(Boolean).join(" · ")}
                      </p>
                      {n.comment ? <p className="truncate text-xs italic text-slate-500">« {n.comment} »</p> : null}
                    </div>
                    <p className="shrink-0 text-right tabular-nums">
                      <span className="text-lg font-bold text-amber-800 dark:text-amber-300">{n.score}</span>
                      <span className="text-xs font-semibold text-slate-400">/{n.max_score}</span>
                      {n.max_score !== 20 && v !== null ? (
                        <span className="block text-[11px] text-slate-500">soit {v.toFixed(1).replace(".", ",")}/20</span>
                      ) : null}
                    </p>
                  </li>
                );
              })
            : absRows.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{a.subject ?? "Cours"}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[shortDateFr(a.date), a.note].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">
                    Absent
                  </span>
                </li>
              ))}
        </ul>
      )}

      {!isGrades && count > 0 ? (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          Une absence à justifier ?{" "}
          <Link to="/messages" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Écrivez à l’école
          </Link>
          {" "}: seule l’administration peut justifier une absence.
        </p>
      ) : null}
    </section>
  );
}
