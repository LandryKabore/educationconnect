import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Assignment } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function MesDevoirs() {
  const { user } = useAuth();

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["mes-devoirs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (!enrollment) return [];

      const { data, error } = await supabase
        .from("devoirs")
        .select("*, matieres(name), rendus_devoirs!left(score, submitted_at)")
        .eq("class_section_id", (enrollment as { class_section_id: string }).class_section_id)
        .eq("rendus_devoirs.student_id", user!.id)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as (Assignment & {
        matieres: { name: string };
        rendus_devoirs: { score: number | null; submitted_at: string | null }[];
      })[];
    },
  });

  return (
    <div>
      <PageHeader title="Mes devoirs" subtitle="Devoirs à rendre" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : assignments.length === 0 ? (
        <EmptyState message="Aucun devoir assigné." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const submission = a.rendus_devoirs?.[0];
            const done = !!submission?.submitted_at;
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-sm text-slate-500">{a.matieres?.name}</p>
                  </div>
                  <Badge tone={done ? "success" : "warning"}>
                    {done ? "Rendu" : "À faire"}
                  </Badge>
                </div>
                {a.description ? (
                  <p className="mt-2 text-sm text-slate-600">{a.description}</p>
                ) : null}
                {a.due_date ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Échéance : {format(new Date(a.due_date), "d MMMM yyyy", { locale: fr })}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
