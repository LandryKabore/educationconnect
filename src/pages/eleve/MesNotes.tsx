import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  programmeToCoefMap,
} from "@/lib/averages";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function MesNotes() {
  const { user } = useAuth();

  const { data: enrollment } = useQuery({
    queryKey: ["mon-inscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as { class_section_id: string } | null;
    },
  });

  const { data: coefMap = {} } = useQuery({
    queryKey: ["programme-coefs", enrollment?.class_section_id],
    enabled: !!enrollment?.class_section_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", enrollment!.class_section_id);
      return programmeToCoefMap(data ?? []);
    },
  });

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ["mes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*), evaluations(type, title)")
        .eq("student_id", user!.id)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & {
        matieres: Subject;
        evaluations: { type: EvaluationType; title: string } | null;
      })[];
    },
  });

  const byPeriod = useMemo(() => {
    const map = new Map<string, typeof grades>();
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
        coefficientBySubject: coefMap,
      }),
    [grades, coefMap],
  );

  return (
    <div>
      <PageHeader title="Mes notes" subtitle="Résultats scolaires" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note publiée pour le moment." />
      ) : (
        <div className="space-y-8">
          {annual.annualAverage !== null ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-900/20">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Moyenne annuelle
                </p>
                <p className="text-xs text-slate-500">
                  (T1 + T2 + T3) / {annual.trimesterCount || 3}
                  {!annual.complete ? " · provisoire" : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-brand-700">
                  {formatAverage(annual.annualAverage)} / 20
                </p>
                <Badge tone={annual.passed ? "success" : "warning"}>
                  {formatPassDecision(annual)}
                </Badge>
              </div>
            </Card>
          ) : null}

          {byPeriod.map(([period, periodGrades]) => {
            const avg = computeWeightedAverage(periodGrades, {
              coefficientBySubject: coefMap,
            });
            return (
              <div key={period}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{period}</h2>
                  {avg.generalAverage !== null ? (
                    <p className="text-sm text-slate-600">
                      Moyenne générale :{" "}
                      <span className="text-lg font-bold text-brand-700">
                        {formatAverage(avg.generalAverage)} / 20
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {periodGrades.map((g) => {
                    const on20 =
                      g.max_score > 0
                        ? ((g.score / g.max_score) * 20).toFixed(2)
                        : "—";
                    const coef =
                      coefMap[g.subject_id] ?? g.matieres?.coefficient ?? 1;
                    const evalLabel = g.evaluations
                      ? `${evaluationTypeLabel(g.evaluations.type)} · ${g.evaluations.title}`
                      : null;
                    return (
                      <Card
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium">{g.matieres?.name ?? "—"}</p>
                          {evalLabel ? (
                            <p className="text-xs text-slate-500">{evalLabel}</p>
                          ) : null}
                          <p className="text-sm text-slate-500">Coef. {coef}</p>
                          {g.comment ? (
                            <p className="mt-1 text-xs text-slate-400">{g.comment}</p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          {g.is_absent ? (
                            <Badge tone="warning">Absent</Badge>
                          ) : (
                            <>
                              <p className="text-lg font-bold text-brand-700">
                                {g.score} / {g.max_score}
                              </p>
                              <Badge>{on20} / 20</Badge>
                            </>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
