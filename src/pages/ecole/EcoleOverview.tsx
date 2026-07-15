import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  GraduationCap,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function EcoleOverview() {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);

  const { data: stats } = useQuery({
    queryKey: ["ecole-stats", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [classes, students, teachers, subjects] = await Promise.all([
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!)
          .eq("role", "student"),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!)
          .eq("role", "teacher"),
        supabase.from("matieres").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
      ]);
      return {
        classes: classes.count ?? 0,
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        subjects: subjects.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Classes", value: stats?.classes ?? 0, to: "/classes", icon: Users },
    { label: "Élèves", value: stats?.students ?? 0, to: "/eleves", icon: GraduationCap },
    { label: "Enseignants", value: stats?.teachers ?? 0, to: "/enseignants", icon: Users },
    { label: "Matières", value: stats?.subjects ?? 0, to: "/matieres", icon: BookOpen },
  ];

  if (!schoolId) {
    return <EmptyState message="Aucune école associée à votre compte." />;
  }

  return (
    <div>
      <PageHeader
        title={school?.name ?? "Mon école"}
        subtitle="Vue d'ensemble de l'établissement"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}>
            <Card className="transition hover:border-brand-300">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <c.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{c.value}</p>
                  <p className="text-sm text-slate-500">{c.label}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link to="/annees">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <Calendar className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Gérer les années scolaires</span>
          </Card>
        </Link>
        <Link to="/emplois-du-temps">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <Calendar className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Emplois du temps</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
