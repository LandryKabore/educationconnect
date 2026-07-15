import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { GradeRow, Subject } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function MesNotes() {
  const { user } = useAuth();

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ["mes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(name)")
        .eq("student_id", user!.id)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & { matieres: { name: string } })[];
    },
  });

  return (
    <div>
      <PageHeader title="Mes notes" subtitle="Résultats scolaires" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note publiée pour le moment." />
      ) : (
        <div className="space-y-3">
          {grades.map((g) => {
            const pct = g.max_score > 0 ? ((g.score / g.max_score) * 100).toFixed(0) : "—";
            return (
              <Card key={g.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{g.matieres?.name ?? "—"}</p>
                  <p className="text-sm text-slate-500">{g.period_label}</p>
                  {g.comment ? (
                    <p className="mt-1 text-xs text-slate-400">{g.comment}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-brand-700">
                    {g.score} / {g.max_score}
                  </p>
                  <Badge tone={Number(pct) >= 50 ? "success" : "warning"}>{pct} %</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
