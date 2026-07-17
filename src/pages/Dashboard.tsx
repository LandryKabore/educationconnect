import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/types";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
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

  const { data: studentHome } = useQuery({
    queryKey: ["student-home", user?.id],
    enabled: role === "student" && !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name, grade_level)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      const row = enrollment as {
        class_section_id?: string;
        classes?: { name: string; grade_level: string | null } | null;
      } | null;

      let devoirsCount = 0;
      if (row?.class_section_id) {
        const { count } = await supabase
          .from("devoirs")
          .select("id", { count: "exact", head: true })
          .eq("class_section_id", row.class_section_id);
        devoirsCount = count ?? 0;
      }

      const { count: notesCount } = await supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("student_id", user!.id);

      const { count: absences } = await supabase
        .from("presences")
        .select("id", { count: "exact", head: true })
        .eq("student_id", user!.id)
        .eq("status", "absent");

      return {
        className: row?.classes?.name ?? null,
        gradeLevel: row?.classes?.grade_level ?? null,
        devoirsCount,
        notesCount: notesCount ?? 0,
        absencesCount: absences ?? 0,
      };
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
        description: "Voir et rendre les devoirs",
        icon: <ClipboardList className="h-5 w-5" />,
      },
      {
        to: "/mes-presences",
        label: "Mes présences",
        description: "Absences et retards",
        icon: <CheckCircle2 className="h-5 w-5" />,
      },
      {
        to: "/mon-emploi-du-temps",
        label: "Mon emploi du temps",
        description: "Planning de la semaine",
        icon: <Calendar className="h-5 w-5" />,
      },
      {
        to: "/mon-bulletin",
        label: "Mon bulletin",
        description: "Télécharger le PDF",
        icon: <FileText className="h-5 w-5" />,
      },
      {
        to: "/messages",
        label: "Messages",
        description: "Boîte de réception",
        icon: <MessageSquare className="h-5 w-5" />,
      },
      {
        to: "/profil",
        label: "Mon profil",
        description: "Informations personnelles",
        icon: <GraduationCap className="h-5 w-5" />,
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
      {
        to: "/ecole",
        label: "Mon école",
        description: "Vue d'ensemble",
        icon: <School className="h-5 w-5" />,
      },
      {
        to: "/eleves",
        label: "Élèves",
        description: "Gestion des élèves",
        icon: <GraduationCap className="h-5 w-5" />,
      },
      {
        to: "/classes",
        label: "Classes",
        description: "Organisation",
        icon: <Users className="h-5 w-5" />,
      },
      {
        to: "/bulletins",
        label: "Bulletins",
        description: "Génération PDF",
        icon: <BookOpen className="h-5 w-5" />,
      },
    ],
  };

  const cards = role ? (cardsByRole[role] ?? []) : [];

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

      {role === "student" && studentHome ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Ma classe
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {studentHome.className ?? "Non affecté"}
            </p>
            {studentHome.gradeLevel ? (
              <p className="text-xs text-slate-500">{studentHome.gradeLevel}</p>
            ) : null}
          </Card>
          <Card className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {studentHome.notesCount}
            </p>
          </Card>
          <Card className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Devoirs (classe)
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {studentHome.devoirsCount}
            </p>
          </Card>
          <Card className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Absences
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {studentHome.absencesCount}
            </p>
          </Card>
        </div>
      ) : null}

      {role === "teacher" && teacherClasses.length > 0 ? (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Mes classes</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teacherClasses.map((a) => {
              const cls = (
                a as {
                  classes: { id: string; name: string; grade_level: string };
                }
              ).classes;
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
