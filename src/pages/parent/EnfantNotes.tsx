import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { GradeRow } from "@/lib/types";
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

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ["enfant-notes", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(name)")
        .eq("student_id", id!)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & { matieres: { name: string } })[];
    },
  });

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
        <div className="space-y-3">
          {grades.map((g) => (
            <Card key={g.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{g.matieres?.name}</p>
                <p className="text-sm text-slate-500">{g.period_label}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-brand-700">
                  {g.score} / {g.max_score}
                </p>
                <Badge>
                  {g.max_score > 0
                    ? `${((g.score / g.max_score) * 100).toFixed(0)} %`
                    : "—"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
