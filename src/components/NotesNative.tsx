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
  v == null ? "text-[#64748b] dark:text-slate-300" : v >= 10 ? "text-[#0f766e] dark:text-brand-300" : "text-[#ff9500]";

const card = "ios-card";
const INK = "text-[#0f172a] dark:text-slate-100";
const MUTED = "text-[#64748b] dark:text-slate-300";

function Ring({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / 20, 0), 1);
  const color = value >= 10 ? "stroke-[#0f766e] dark:stroke-brand-300" : "stroke-[#ff9500]";
  const track = value >= 10 ? "stroke-[#0f766e]/15" : "stroke-[#ff9500]/15";
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className={track} />
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
        <span className={cn("text-[17px] font-bold tabular-nums", INK)}>{value.toFixed(1)}</span>
        <span className={cn("text-[11px] font-semibold", MUTED)}>/20</span>
      </span>
    </div>
  );
}

function Stat({ title, value, detail, valueClass }: { title: string; value: number; detail: string; valueClass: string }) {
  return (
    <div className={cn(card, "min-w-0 space-y-1 p-[14px]")}>
      <p className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", MUTED)}>{title}</p>
      <p className={cn("text-[22px] font-bold leading-tight tabular-nums", valueClass)}>{value}</p>
      <p className={cn("truncate text-xs", MUTED)}>{detail}</p>
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
      <div className="native-sticky sticky top-[52px] z-20 -mx-4 -mt-3 space-y-3 px-4 pb-[10px] pt-3 lg:top-0">
        <div role="tablist" aria-label="Période" className="ios-seg">
          {periods.map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => choose(p)}
              >
                {p === ALL ? "Tout" : p}
              </button>
            );
          })}
        </div>

        {average != null ? (
          <div className={cn(card, "flex items-center gap-4 p-4")}>
            <Ring value={average} />
            <div className="min-w-0 space-y-1">
              <p className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", MUTED)}>Moyenne</p>
              <p className={cn("text-[22px] font-bold leading-tight tabular-nums", INK)}>
                {average.toFixed(1)} / 20
              </p>
              <p className={cn("text-xs", MUTED)}>
                {period === ALL ? "Sur toutes les notes publiées" : `Sur ${period.toLowerCase()}`}
              </p>
            </div>
          </div>
        ) : (
          <p className={cn(card, "p-4 text-[15px]", MUTED)}>
            Aucune note sur cette période.
          </p>
        )}
      </div>

      <div className="space-y-2.5 pb-6 pt-1">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat
              title="Notes"
              value={filtered.length}
              detail={`publiée${filtered.length === 1 ? "" : "s"}`}
              valueClass="text-[#153064] dark:text-slate-100"
            />
            <Stat
              title="Matières"
              value={subjects.length}
              detail={`évaluée${subjects.length === 1 ? "" : "s"}`}
              valueClass="text-[#0f766e] dark:text-brand-300"
            />
            <Stat
              title="Absents"
              value={absentCount}
              detail={absentCount === 0 ? "aucune" : `non noté${absentCount === 1 ? "" : "s"}`}
              valueClass={absentCount === 0 ? "text-[#4b8f4a]" : "text-[#ff9500]"}
            />
          </div>
        ) : null}

        {subjects.length > 0 ? (
          <div className={cn("flex items-center justify-between px-0 pt-1 text-xs font-bold uppercase tracking-[0.6px]", MUTED)}>
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
                className="flex min-h-14 w-full items-start gap-[10px] p-[14px] text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[15px] font-semibold", INK)}>{s.name}</span>
                  <span className={cn("mt-1 block text-xs", MUTED)}>
                    {s.grades.length} note{s.grades.length === 1 ? "" : "s"} · Coef. {s.coefficient}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={cn("text-[17px] font-semibold tabular-nums", tone(s.average))}>
                    {s.average != null ? formatAverage(s.average) : "—"}
                  </span>
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 text-[#64748b] transition-transform duration-200", expanded && "rotate-180")}
                    strokeWidth={3}
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
                    "mx-0 min-h-0 divide-y divide-[rgba(60,60,67,0.12)] overflow-hidden dark:divide-[var(--border)]",
                    expanded && "border-t border-[rgba(60,60,67,0.12)] dark:border-[var(--border)]",
                  )}
                >
                  {s.grades.map((g) => {
                    const on20 = g.is_absent || !(g.max_score > 0) ? null : scoreOn20(g.score, g.max_score);
                    const date = g.evaluations?.eval_date
                      ? formatDateSafe(g.evaluations.eval_date, "d MMM", { locale: fr })
                      : null;
                    const comment = g.comment?.trim();
                    return (
                      <li key={g.id} className="flex items-start gap-3 px-[14px] py-3">
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[15px] font-medium", INK)}>
                            {g.evaluations?.title?.trim() || s.name}
                          </p>
                          <p className={cn("mt-[5px] flex flex-wrap items-center gap-1.5 text-xs", MUTED)}>
                            {g.evaluations?.type ? (
                              <span className="rounded-full bg-[#153064]/[0.08] px-2 py-[3px] text-[11px] font-bold text-[#153064] dark:bg-[var(--surface-2)] dark:text-slate-100">
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
                            <span className="rounded-full bg-[#ff9500]/[0.12] px-2.5 py-[5px] text-xs font-bold text-[#ff9500]">
                              Absent
                            </span>
                          ) : on20 != null ? (
                            <>
                              <p className={cn("text-[17px] font-bold tabular-nums", tone(on20))}>
                                {on20.toFixed(1)}
                                <span className={cn("text-xs font-semibold", MUTED)}> / 20</span>
                              </p>
                              {g.max_score !== 20 ? (
                                <p className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                                  {g.score} / {g.max_score}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className={cn("text-[17px] font-semibold", MUTED)}>—</span>
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
