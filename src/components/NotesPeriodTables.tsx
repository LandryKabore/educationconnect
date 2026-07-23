import { useMemo } from "react";
import {
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  scoreOn20,
} from "@/lib/averages";
import {
  evaluationTypeLabel,
  evaluationTypeShort,
  evaluationTypeTone,
} from "@/lib/evaluationTypes";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export type NotesPeriodGrade = GradeRow & {
  matieres?: Subject | null;
  evaluations?: { type: EvaluationType; title: string } | null;
};

type Props = {
  grades: NotesPeriodGrade[];
  coefficientBySubject?: Record<string, number>;
  /** Show évaluation type + title (student view). */
  showEvaluation?: boolean;
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

function scoreTone(on20: number | null): string {
  if (on20 === null) return "text-slate-500";
  if (on20 >= 14) return "text-emerald-700 dark:text-emerald-400";
  if (on20 >= 10) return "text-brand-700";
  return "text-amber-700 dark:text-amber-400";
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
  className,
}: Props) {
  const byPeriod = useMemo(() => {
    const map = new Map<string, NotesPeriodGrade[]>();
    for (const g of grades) {
      const list = map.get(g.period_label) ?? [];
      list.push(g);
      map.set(g.period_label, list);
    }
    return [...map.entries()];
  }, [grades]);

  const annual = useMemo(
    () =>
      computeAnnualAverage(grades, {
        coefficientBySubject,
      }),
    [grades, coefficientBySubject],
  );

  if (grades.length === 0) return null;

  return (
    <div className={cn("space-y-6", className)}>
      {annual.annualAverage !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/20">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Moyenne annuelle
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              (T1 + T2 + T3) / {annual.trimesterCount || 3}
              {!annual.complete ? " · provisoire" : ""} · seuil 10 / 20
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
              <span className="text-base font-semibold text-slate-400">
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
                <span className="text-slate-400"> / 20</span>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subjects.map((subject) => (
                <Card
                  key={`${period}-${subject.subjectId}`}
                  className="flex flex-col overflow-hidden p-0"
                >
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-[var(--border)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                          {subject.subjectName}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Coef. {subject.coefficient}
                          {subject.grades.length > 1
                            ? ` · ${subject.grades.length} notes`
                            : " · 1 note"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "text-xl font-bold tabular-nums leading-none",
                            scoreTone(subject.averageOn20),
                          )}
                        >
                          {subject.averageOn20 !== null
                            ? formatAverage(subject.averageOn20)
                            : "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          / 20
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width]",
                          subject.averageOn20 !== null &&
                            subject.averageOn20 >= 14
                            ? "bg-emerald-500"
                            : subject.averageOn20 !== null &&
                                subject.averageOn20 >= 10
                              ? "bg-brand-500"
                              : "bg-amber-500",
                        )}
                        style={{
                          width: scoreBarWidth(subject.averageOn20),
                        }}
                      />
                    </div>
                  </div>

                  <ul className="divide-y divide-slate-100 dark:divide-[var(--border)]">
                    {subject.grades.map((g) => {
                      const absent = Boolean(g.is_absent);
                      const on20 = absent
                        ? null
                        : g.max_score > 0
                          ? scoreOn20(g.score, g.max_score)
                          : null;
                      const comment = g.comment?.trim() || "";
                      const evalType = g.evaluations?.type;
                      const evalTitle = g.evaluations?.title?.trim();

                      return (
                        <li key={g.id} className="px-4 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              {showEvaluation && evalType ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge tone={evaluationTypeTone(evalType)}>
                                    {evaluationTypeShort(evalType)}
                                  </Badge>
                                  {evalTitle ? (
                                    <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                                      {evalTitle}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-slate-500">
                                      {evaluationTypeLabel(evalType)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                  Note
                                </p>
                              )}
                              {comment ? (
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {comment}
                                </p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              {absent ? (
                                <Badge tone="warning">Absent</Badge>
                              ) : (
                                <>
                                  <p
                                    className={cn(
                                      "text-sm font-bold tabular-nums",
                                      scoreTone(on20),
                                    )}
                                  >
                                    {on20 !== null
                                      ? on20.toFixed(1)
                                      : "—"}
                                    <span className="font-medium text-slate-400">
                                      {" "}
                                      /20
                                    </span>
                                  </p>
                                  <p className="text-[11px] tabular-nums text-slate-400">
                                    {g.score} / {g.max_score}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
