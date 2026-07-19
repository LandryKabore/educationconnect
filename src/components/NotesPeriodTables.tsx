import { useMemo } from "react";
import {
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  scoreOn20,
} from "@/lib/averages";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
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

function coefFor(
  g: NotesPeriodGrade,
  map?: Record<string, number>,
): number {
  return map?.[g.subject_id] ?? g.matieres?.coefficient ?? 1;
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
    <div className={cn("space-y-8", className)}>
      {annual.annualAverage !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 dark:border-brand-800 dark:bg-brand-900/20">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Moyenne annuelle
            </p>
            <p className="text-xs text-slate-500">
              (T1 + T2 + T3) / {annual.trimesterCount || 3}
              {!annual.complete ? " · provisoire" : ""} · seuil 10 / 20
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-brand-700">
              {formatAverage(annual.annualAverage)} / 20
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
        return (
          <section key={period} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {period}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Moyenne générale :{" "}
                <span className="text-lg font-bold text-brand-700">
                  {avg.generalAverage !== null
                    ? `${formatAverage(avg.generalAverage)} / 20`
                    : "—"}
                </span>
              </p>
            </div>

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-[var(--surface-2)] dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Matière</th>
                      {showEvaluation ? (
                        <th className="px-3 py-2.5 font-semibold">
                          Évaluation
                        </th>
                      ) : null}
                      <th className="px-3 py-2.5 font-semibold">Coef.</th>
                      <th className="px-3 py-2.5 font-semibold">Note</th>
                      <th className="px-3 py-2.5 font-semibold">/20</th>
                      <th className="px-3 py-2.5 font-semibold">
                        Commentaire
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodGrades.map((g) => {
                      const absent = Boolean(g.is_absent);
                      const on20 = absent
                        ? "—"
                        : g.max_score > 0
                          ? scoreOn20(g.score, g.max_score).toFixed(2)
                          : "—";
                      const evalLabel = g.evaluations
                        ? `${evaluationTypeLabel(g.evaluations.type)} · ${g.evaluations.title}`
                        : "—";
                      return (
                        <tr
                          key={g.id}
                          className="border-t border-slate-100 dark:border-[var(--border)]"
                        >
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                            {g.matieres?.name ?? "—"}
                          </td>
                          {showEvaluation ? (
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                              {evalLabel}
                            </td>
                          ) : null}
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                            {coefFor(g, coefficientBySubject)}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                            {absent ? (
                              <Badge tone="warning">Absent</Badge>
                            ) : (
                              `${g.score} / ${g.max_score}`
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-brand-700">
                            {on20}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {g.comment?.trim() || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {avg.subjects.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Moyennes par matière
                </h3>
                <Card className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-[var(--surface-2)] dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">
                            Matière
                          </th>
                          <th className="px-3 py-2.5 font-semibold">Coef.</th>
                          <th className="px-3 py-2.5 font-semibold">
                            Moyenne /20
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {avg.subjects.map((s) => (
                          <tr
                            key={s.subjectId}
                            className="border-t border-slate-100 dark:border-[var(--border)]"
                          >
                            <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                              {s.subjectName}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                              {s.coefficient}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-brand-700">
                              {formatAverage(s.averageOn20)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
