import { useMemo } from "react";
import { fr } from "date-fns/locale";
import {
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  scoreOn20,
} from "@/lib/averages";
import { formatDateSafe } from "@/lib/dateFr";
import {
  evaluationTypeLabel,
  evaluationTypeShort,
} from "@/lib/evaluationTypes";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export type NotesPeriodGrade = GradeRow & {
  matieres?: Subject | null;
  evaluations?: {
    type: EvaluationType;
    title: string;
    eval_date?: string | null;
  } | null;
};

type Props = {
  grades: NotesPeriodGrade[];
  coefficientBySubject?: Record<string, number>;
  /** Show évaluation type + title (student view). */
  showEvaluation?: boolean;
  /**
   * When set to a trimester label, only that period is shown (no annual strip).
   * When `"Année"`, show the annual strip + every trimester.
   * When omitted, keep the previous all-periods layout.
   */
  periodFilter?: string | null;
  className?: string;
};

type SubjectGroup = {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  averageOn20: number | null;
  grades: NotesPeriodGrade[];
};

function coefFor(
  g: NotesPeriodGrade,
  map?: Record<string, number>,
): number {
  return map?.[g.subject_id] ?? g.matieres?.coefficient ?? 1;
}

const TYPE_CHIP: Record<string, string> = {
  examen: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  composition: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  interrogation: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  devoir: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  default: "bg-slate-100 text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300",
};

/** « Examen 3 · Anglais » → « Examen 3 » inside the Anglais card. */
function cleanTitle(title: string | null | undefined, subject: string) {
  const t = title?.trim() ?? "";
  if (!t) return "";
  const esc = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = t
    .replace(new RegExp(`\\s*[·\\-–—]\\s*${esc}\\s*$`, "i"), "")
    // the section already says « Trimestre 3 »: no « T3 » in titles
    .replace(/\s+T[123]\b/g, "")
    .trim();
  return cleaned || t;
}

function scoreTone(on20: number | null): string {
  if (on20 === null) return "text-slate-500";
  if (on20 >= 14) return "text-emerald-700 dark:text-emerald-400";
  if (on20 >= 10) return "text-slate-900 dark:text-slate-100";
  return "text-rose-700 dark:text-rose-400";
}

function scoreBarWidth(on20: number | null): string {
  if (on20 === null) return "0%";
  return `${Math.min(100, Math.max(0, (on20 / 20) * 100))}%`;
}

function groupBySubject(
  periodGrades: NotesPeriodGrade[],
  coefficientBySubject: Record<string, number>,
): SubjectGroup[] {
  const avg = computeWeightedAverage(periodGrades, { coefficientBySubject });
  const avgById = new Map(avg.subjects.map((s) => [s.subjectId, s]));

  const map = new Map<string, NotesPeriodGrade[]>();
  for (const g of periodGrades) {
    const id = g.subject_id || g.matieres?.id || "unknown";
    const list = map.get(id) ?? [];
    list.push(g);
    map.set(id, list);
  }

  const groups: SubjectGroup[] = [];
  for (const [subjectId, list] of map) {
    const summary = avgById.get(subjectId);
    groups.push({
      subjectId,
      subjectName:
        summary?.subjectName ?? list[0]?.matieres?.name ?? "Matière",
      coefficient:
        summary?.coefficient ?? coefFor(list[0]!, coefficientBySubject),
      averageOn20: summary?.averageOn20 ?? null,
      grades: list,
    });
  }

  groups.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "fr"));
  return groups;
}

export function NotesPeriodTables({
  grades,
  coefficientBySubject = {},
  showEvaluation = false,
  periodFilter = null,
  className,
}: Props) {
  const byPeriod = useMemo(() => {
    const map = new Map<string, NotesPeriodGrade[]>();
    for (const g of grades) {
      const label = g.period_label?.trim() || "Sans période";
      const list = map.get(label) ?? [];
      list.push(g);
      map.set(label, list);
    }
    let entries = [...map.entries()];
    if (periodFilter && periodFilter !== "Année") {
      entries = entries.filter(([period]) => period === periodFilter);
    }
    return entries;
  }, [grades, periodFilter]);

  const annual = useMemo(
    () =>
      computeAnnualAverage(grades, {
        coefficientBySubject,
      }),
    [grades, coefficientBySubject],
  );

  const showAnnual =
    periodFilter == null || periodFilter === "Année"
      ? annual.annualAverage !== null
      : false;

  if (grades.length === 0) return null;
  if (periodFilter && periodFilter !== "Année" && byPeriod.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300">
        Aucune note pour {periodFilter} pour le moment.
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {showAnnual ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/20">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Moyenne annuelle
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Moyenne des trimestres notés ({annual.trimesterCount || 3} sur 3)
              {!annual.complete ? " · provisoire" : ""} · admis à partir de 10 / 20
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                scoreTone(annual.annualAverage),
              )}
            >
              {formatAverage(annual.annualAverage)}{" "}
              <span className="text-base font-semibold text-slate-600">
                / 20
              </span>
            </p>
            <Badge tone={annual.passed ? "success" : "warning"}>
              {formatPassDecision(annual)}
            </Badge>
          </div>
        </div>
      ) : null}

      {byPeriod.map(([period, periodGrades]) => {
        const avg = computeWeightedAverage(periodGrades, {
          coefficientBySubject,
        });
        const subjects = groupBySubject(periodGrades, coefficientBySubject);

        return (
          <section key={period} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2 dark:border-[var(--border)]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {period}
              </h2>
              <p className="text-sm text-slate-500">
                Moyenne générale{" "}
                <span
                  className={cn(
                    "ml-1 text-xl font-bold tabular-nums",
                    scoreTone(avg.generalAverage),
                  )}
                >
                  {avg.generalAverage !== null
                    ? formatAverage(avg.generalAverage)
                    : "—"}
                </span>
                <span className="text-slate-600"> / 20</span>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {subjects.map((subject) => {
                const when = (g: NotesPeriodGrade) => g.evaluations?.eval_date ?? (g as { created_at?: string }).created_at ?? "";
                const rows = [...subject.grades].sort((a, b) => when(b).localeCompare(when(a)));
                return (
                  <article
                    key={`${period}-${subject.subjectId}`}
                    className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]"
                  >
                    <div className="px-4 pb-3 pt-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-900 dark:text-slate-100">{subject.subjectName}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Coef. {subject.coefficient} · {subject.grades.length} note{subject.grades.length > 1 ? "s" : ""}
                          </p>
                        </div>
                        <p className={cn("shrink-0 text-2xl font-bold leading-none tabular-nums", scoreTone(subject.averageOn20))}>
                          {subject.averageOn20 !== null ? formatAverage(subject.averageOn20) : "—"}
                          <span className="text-xs font-semibold text-slate-400">/20</span>
                        </p>
                      </div>
                      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            subject.averageOn20 === null
                              ? ""
                              : subject.averageOn20 >= 14
                                ? "bg-emerald-500"
                                : subject.averageOn20 >= 10
                                  ? "bg-brand-500"
                                  : "bg-rose-500",
                          )}
                          style={{ width: scoreBarWidth(subject.averageOn20) }}
                        />
                        <span className="absolute inset-y-0 left-1/2 w-px bg-slate-400/60" title="10/20" />
                      </div>
                    </div>

                    <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-[var(--border)] dark:border-[var(--border)]">
                      {rows.map((g) => {
                        const absent = Boolean(g.is_absent);
                        const on20 = absent ? null : g.max_score > 0 ? scoreOn20(g.score, g.max_score) : null;
                        const comment = g.comment?.trim() || "";
                        const evalType = g.evaluations?.type;
                        const title = cleanTitle(g.evaluations?.title, subject.subjectName);
                        const date = g.evaluations?.eval_date ?? null;
                        return (
                          <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="w-11 shrink-0 text-center text-[11px] leading-tight text-slate-500">
                              {date ? (
                                <>
                                  <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {formatDateSafe(date, "d", { locale: fr })}
                                  </span>
                                  {formatDateSafe(date, "MMM", { locale: fr })}
                                </>
                              ) : (
                                "—"
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              {showEvaluation && evalType ? (
                                <span className="flex items-center gap-1.5">
                                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", TYPE_CHIP[evalType] ?? TYPE_CHIP.default)}>
                                    {evaluationTypeShort(evalType)}
                                  </span>
                                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                    {title || evaluationTypeLabel(evalType)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-sm text-slate-600 dark:text-slate-300">Note</span>
                              )}
                              {comment ? <span className="mt-0.5 block truncate text-xs italic text-slate-500">« {comment} »</span> : null}
                            </span>
                            {absent ? (
                              <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                Absent
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "shrink-0 rounded-md px-2 py-1 text-right tabular-nums",
                                  on20 === null
                                    ? "bg-slate-50 dark:bg-[var(--surface-2)]"
                                    : on20 >= 14
                                      ? "bg-emerald-50 dark:bg-emerald-500/10"
                                      : on20 >= 10
                                        ? "bg-slate-50 dark:bg-[var(--surface-2)]"
                                        : "bg-rose-50 dark:bg-rose-500/10",
                                )}
                                title={g.max_score !== 20 && on20 !== null ? `soit ${on20.toFixed(1)} / 20` : undefined}
                              >
                                <span className={cn("text-sm font-bold", scoreTone(on20))}>{g.score}</span>
                                <span className="text-[11px] font-medium text-slate-400">/{g.max_score}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
