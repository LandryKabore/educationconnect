import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/types";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  GraduationCap,
  MessageSquare,
  School,
  Users,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

interface DashCard {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export default function Dashboard() {
  const { role, profile, schoolId, user } = useAuth();

  const { data: teacherClasses = [] } = useQuery({
    queryKey: ["teacher-classes", user?.id],
    enabled: role === "teacher" && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select("*, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cardsByRole: Record<string, DashCard[]> = {
    teacher: [
      {
        to: "/devoirs",
        label: "Devoirs",
        description: "Créer et gérer les devoirs",
        icon: <ClipboardList className="h-5 w-5" />,
      },
      {
        to: "/messages",
        label: "Messages",
        description: "Communiquer avec l'école",
        icon: <MessageSquare className="h-5 w-5" />,
      },
    ],
    student: [
      {
        to: "/mes-notes",
        label: "Mes notes",
        description: "Consulter vos résultats",
        icon: <BookOpen className="h-5 w-5" />,
      },
      {
        to: "/mes-devoirs",
        label: "Mes devoirs",
        description: "Voir les devoirs à rendre",
        icon: <ClipboardList className="h-5 w-5" />,
      },
      {
        to: "/mon-emploi-du-temps",
        label: "Mon emploi du temps",
        description: "Planning de la semaine",
        icon: <Calendar className="h-5 w-5" />,
      },
      {
        to: "/messages",
        label: "Messages",
        description: "Boîte de réception",
        icon: <MessageSquare className="h-5 w-5" />,
      },
    ],
    parent: [
      {
        to: "/enfants",
        label: "Mes enfants",
        description: "Suivi scolaire",
        icon: <Users className="h-5 w-5" />,
      },
      {
        to: "/messages",
        label: "Messages",
        description: "Communiquer avec l'école",
        icon: <MessageSquare className="h-5 w-5" />,
      },
    ],
    school_admin: [
      { to: "/ecole", label: "Mon école", description: "Vue d'ensemble", icon: <School className="h-5 w-5" /> },
      { to: "/eleves", label: "Élèves", description: "Gestion des élèves", icon: <GraduationCap className="h-5 w-5" /> },
      { to: "/classes", label: "Classes", description: "Organisation", icon: <Users className="h-5 w-5" /> },
      { to: "/bulletins", label: "Bulletins", description: "Génération PDF", icon: <BookOpen className="h-5 w-5" /> },
    ],
  };

  const cards = role ? cardsByRole[role] ?? [] : [];

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={
          role
            ? `${fullName(profile?.first_name, profile?.last_name)} — ${ROLE_LABELS[role]}`
            : undefined
        }
      />

      {role === "teacher" && teacherClasses.length > 0 ? (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Mes classes</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teacherClasses.map((a) => {
              const cls = (a as { classes: { id: string; name: string; grade_level: string } }).classes;
              const mat = (a as { matieres: { name: string } }).matieres;
              return (
                <Link key={(a as { id: string }).id} to={`/classes/${cls.id}`}>
                  <Card className="transition hover:border-brand-300">
                    <h3 className="font-semibold">{cls.name}</h3>
                    <p className="text-sm text-slate-500">{mat?.name}</p>
                    <p className="text-xs text-slate-400">{cls.grade_level}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}>
            <Card className="flex h-full items-start gap-4 transition hover:border-brand-300">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                {c.icon}
              </div>
              <div>
                <h3 className="font-semibold">{c.label}</h3>
                <p className="text-sm text-slate-500">{c.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {!role && schoolId ? (
        <p className="mt-4 text-sm text-slate-500">Aucun rôle actif détecté.</p>
      ) : null}
    </div>
  );
}
