import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: cls, isLoading } = useQuery({
    queryKey: ["class", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: studentCount = 0 } = useQuery({
    queryKey: ["class-students", id],
    enabled: !!id,
    queryFn: async () => {
      const { count } = await supabase
        .from("inscriptions")
        .select("id", { count: "exact", head: true })
        .eq("class_section_id", id!)
        .eq("status", "active");
      return count ?? 0;
    },
  });

  if (isLoading) return <p className="text-slate-500">Chargement…</p>;
  if (!cls) return <EmptyState message="Classe introuvable." />;

  return (
    <div>
      <PageHeader
        title={cls.name as string}
        subtitle={(cls.grade_level as string) || undefined}
      />

      <p className="mb-6 text-sm text-slate-500">{studentCount} élève(s) inscrit(s)</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to={`/classes/${id}/presences`}>
          <Card className="flex items-center gap-4 transition hover:border-brand-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Présences</h3>
              <p className="text-sm text-slate-500">Marquer les présences du jour</p>
            </div>
          </Card>
        </Link>
        <Link to={`/classes/${id}/notes`}>
          <Card className="flex items-center gap-4 transition hover:border-brand-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Notes</h3>
              <p className="text-sm text-slate-500">Saisir les notes des élèves</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
