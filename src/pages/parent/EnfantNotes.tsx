import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  computeWeightedAverage,
  formatAverage,
  programmeToCoefMap,
} from "@/lib/averages";
import type { GradeRow, Subject } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function EnfantNotes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: link } = useQuery({
    queryKey: ["parent-link", user?.id, id],
    enabled: !!user?.id && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("liens_parent_eleve")
        .select("*, profils:profils!liens_parent_eleve_student_id_fkey(*)")
        .eq("parent_id", user!.id)
        .eq("student_id", id!)
        .maybeSingle();
      return data;
    },
  });

  const child = (link as { profils?: { first_name: string; last_name: string } } | null)?.profils;

  const { data: enrollment } = useQuery({
    queryKey: ["enfant-inscription", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", id!)
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
    queryKey: ["enfant-notes", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*)")
        .eq("student_id", id!)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & { matieres: Subject })[];
    },
  });

  const byPeriod = useMemo(() => {
    const map = new Map<string, (GradeRow & { matieres: Subject })[]>();
    for (const g of grades) {
      const list = map.get(g.period_label) ?? [];
      list.push(g);
      map.set(g.period_label, list);
    }
    return [...map.entries()];
  }, [grades]);

  if (!link && !isLoading) {
    return <EmptyState message="Accès non autorisé à cet élève." />;
  }

  return (
    <div>
      <Link
        to="/enfants"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux enfants
      </Link>

      <PageHeader
        title={child ? `Notes — ${fullName(child.first_name, child.last_name)}` : "Notes"}
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note disponible." />
      ) : (
        <div className="space-y-8">
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
                    const coef =
                      coefMap[g.subject_id] ?? g.matieres?.coefficient ?? 1;
                    return (
                      <Card
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium">{g.matieres?.name}</p>
                          <p className="text-sm text-slate-500">Coef. {coef}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-brand-700">
                            {g.score} / {g.max_score}
                          </p>
                          <Badge>
                            {g.max_score > 0
                              ? `${((g.score / g.max_score) * 20).toFixed(2)} / 20`
                              : "—"}
                          </Badge>
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
