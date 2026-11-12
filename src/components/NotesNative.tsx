import { useMemo, useState } from "react";
import { fr } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import {
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  scoreOn20,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { formatDateSafe } from "@/lib/dateFr";
import { evaluationTypeShort } from "@/lib/evaluationTypes";
import { cn } from "@/lib/utils";
import type { NotesPeriodGrade } from "@/components/NotesPeriodTables";

const ALL = "Tous";

const tone = (v: number | null) =>
  v == null
    ? "text-slate-500 dark:text-slate-300"
    : v >= 10
      ? "text-brand-700 dark:text-brand-300"
      : "text-amber-600 dark:text-amber-400";

const card =
  "rounded-2xl border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]";

function Ring({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / 20, 0), 1);
  const color = value >= 10 ? "stroke-brand-700 dark:stroke-brand-300" : "stroke-amber-500";
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-600" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
          className={color}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{value.toFixed(1)}</span>
        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">/20</span>
      </span>
    </div>
  );
}

function Stat({ title, value, detail, valueClass }: { title: string; value: number; detail: string; valueClass: string }) {
  return (
    <div className={cn(card, "min-w-0 p-3")}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</p>
      <p className={cn("mt-0.5 text-2xl font-bold tabular-nums", valueClass)}>{value}</p>
      <p className="truncate text-xs text-slate-600 dark:text-slate-300">{detail}</p>
    </div>
  );
}

/**
 * Android app « Mes notes » — same layout as the native iOS StudentGradesView:
 * period selector + average ring (the only sticky part), then stats and one
 * collapsible block per subject.
 */
export function NotesNative({
  grades,
  coefficientBySubject,
}: {
  grades: NotesPeriodGrade[];
  coefficientBySubject: Record<string, number>;
}) {
  const [period, setPeriod] = useState(ALL);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const periods = useMemo(() => {
    const found = new Set(grades.map((g) => g.period_label).filter(Boolean));
    const official = [...TRIMESTER_PERIODS] as string[];
    return [...official, ALL, ...[...found].filter((p) => !official.includes(p)).sort()];
  }, [grades]);

  const filtered = useMemo(
    () => (period === ALL ? grades : grades.filter((g) => g.period_label === period)),
    [grades, period],
  );

  const average = useMemo(() => {
    if (filtered.length === 0) return null;
    const weighted = computeWeightedAverage(filtered, { coefficientBySubject }).generalAverage;
    if (period !== ALL) return weighted;
    // same figure as the bulletin: mean of the trimester averages
    return computeAnnualAverage(grades, { coefficientBySubject }).annualAverage ?? weighted;
  }, [filtered, grades, period, coefficientBySubject]);

  const subjects = useMemo(() => {
    const summary = computeWeightedAverage(filtered, { coefficientBySubject });
    const avgById = new Map(summary.subjects.map((s) => [s.subjectId, s]));
    const map = new Map<string, NotesPeriodGrade[]>();
    for (const g of filtered) {
      const id = g.subject_id || g.matieres?.id || "unknown";
      map.set(id, [...(map.get(id) ?? []), g]);
    }
    const dateOf = (g: NotesPeriodGrade) =>
      g.evaluations?.eval_date ?? (g as { created_at?: string }).created_at ?? "";
    return [...map.entries()]
      .map(([id, list]) => ({
        id,
        name: avgById.get(id)?.subjectName ?? list[0]?.matieres?.name ?? "Matière",
        coefficient: avgById.get(id)?.coefficient ?? list[0]?.matieres?.coefficient ?? 1,
        average: avgById.get(id)?.averageOn20 ?? null,
        grades: [...list].sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [filtered, coefficientBySubject]);

  const absentCount = filtered.filter((g) => g.is_absent).length;

  const choose = (p: string) => {
    setPeriod(p);
    setOpen(new Set());
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {/* Sticky: trimestre + moyenne only */}
      <div className="sticky top-14 z-20 -mx-4 space-y-3 bg-[var(--bg)] px-4 pb-3 pt-3 lg:top-0">
        <div
          role="tablist"
          aria-label="Période"
          className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
        >
          {periods.map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => choose(p)}
                className={cn(
                  "min-h-11 min-w-16 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors",
                  active
                    ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                    : "text-slate-700 dark:text-slate-300",
                )}
              >
                {p === ALL ? "Tout" : p.replace("Trimestre ", "T")}
              </button>
            );
          })}
        </div>

        {average != null ? (
          <div className={cn(card, "flex items-center gap-4 p-4")}>
            <Ring value={average} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Moyenne</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {average.toFixed(1)} / 20
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {period === ALL ? "Sur toutes les notes publiées" : `Sur ${period.toLowerCase()}`}
              </p>
            </div>
          </div>
        ) : (
          <p className={cn(card, "p-4 text-sm text-slate-600 dark:text-slate-300")}>
            Aucune note sur cette période.
          </p>
        )}
      </div>

      <div className="space-y-2.5 pb-6">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat
              title="Notes"
              value={filtered.length}
              detail={`publiée${filtered.length === 1 ? "" : "s"}`}
              valueClass="text-slate-900 dark:text-slate-100"
            />
            <Stat
              title="Matières"
              value={subjects.length}
              detail={`évaluée${subjects.length === 1 ? "" : "s"}`}
              valueClass="text-brand-700 dark:text-brand-300"
            />
            <Stat
              title="Absents"
              value={absentCount}
              detail={absentCount === 0 ? "aucune" : `non noté${absentCount === 1 ? "" : "s"}`}
              valueClass={absentCount === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
            />
          </div>
        ) : null}

        {subjects.length > 0 ? (
          <div className="flex items-center justify-between px-1 pt-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            <span>Matières</span>
            <span>{subjects.length}</span>
          </div>
        ) : null}

        {subjects.map((s) => {
          const expanded = open.has(s.id);
          const panelId = `notes-${s.id}`;
          return (
            <section key={s.id} className={cn(card, "overflow-hidden")}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(s.id)}
                className="flex min-h-14 w-full items-start gap-3 p-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{s.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-300">
                    {s.grades.length} note{s.grades.length === 1 ? "" : "s"} · Coef. {s.coefficient}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={cn("text-base font-bold tabular-nums", tone(s.average))}>
                    {s.average != null ? formatAverage(s.average) : "—"}
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 text-slate-500 transition-transform duration-200", expanded && "rotate-180")}
                    aria-hidden
                  />
                </span>
              </button>
              <div
                id={panelId}
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <ul
                  className={cn(
                    "min-h-0 divide-y divide-slate-100 overflow-hidden dark:divide-[var(--border)]",
                    expanded && "border-t border-slate-100 dark:border-[var(--border)]",
                  )}
                >
                  {s.grades.map((g) => {
                    const on20 = g.is_absent || !(g.max_score > 0) ? null : scoreOn20(g.score, g.max_score);
                    const date = g.evaluations?.eval_date
                      ? formatDateSafe(g.evaluations.eval_date, "d MMM", { locale: fr })
                      : null;
                    const comment = g.comment?.trim();
                    return (
                      <li key={g.id} className="flex items-start gap-3 px-3.5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {g.evaluations?.title?.trim() || s.name}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                            {g.evaluations?.type ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold dark:bg-[var(--surface-2)]">
                                {evaluationTypeShort(g.evaluations.type)}
                              </span>
                            ) : null}
                            {date ?? (period === ALL ? g.period_label : null)}
                          </p>
                          {comment ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{comment}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          {g.is_absent ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                              Absent
                            </span>
                          ) : on20 != null ? (
                            <>
                              <p className={cn("text-base font-bold tabular-nums", tone(on20))}>
                                {on20.toFixed(1)}
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300"> / 20</span>
                              </p>
                              {g.max_score !== 20 ? (
                                <p className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                                  {g.score} / {g.max_score}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-base font-bold text-slate-500">—</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
