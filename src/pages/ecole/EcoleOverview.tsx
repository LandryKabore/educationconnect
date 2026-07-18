import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Settings,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolSetupProgress } from "@/hooks/useSchoolSetupProgress";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { PortalGreeting } from "@/components/PortalGreeting";
import { enterSetupGuide } from "@/components/SetupGuideBar";

export default function EcoleOverview() {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const { progress, nextStep, steps } = useSchoolSetupProgress();

  const { data: stats } = useQuery({
    queryKey: ["ecole-stats", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [classes, students, teachers, subjects, parents] = await Promise.all([
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
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!)
          .eq("role", "parent"),
      ]);
      return {
        classes: classes.count ?? 0,
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        subjects: subjects.count ?? 0,
        parents: parents.count ?? 0,
      };
    },
  });

  const { data: currentYear } = useQuery({
    queryKey: ["annee-courante", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("annees_scolaires")
        .select("label")
        .eq("school_id", schoolId!)
        .eq("is_current", true)
        .maybeSingle();
      return data?.label as string | undefined;
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

  const setupIncomplete = progress && !progress.complete;

  return (
    <div>
      <PortalGreeting />
      <PageHeader
        title={school?.name ?? "Mon école"}
        subtitle={
          currentYear
            ? `Année ${currentYear} · Vue d'ensemble`
            : "Vue d'ensemble de l'établissement"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/ecole/parametres">
              <Button variant="outline" size="sm">
                <Settings className="mr-1 h-4 w-4" />
                Paramètres
              </Button>
            </Link>
            <Link to="/ecole/configuration">
              <Button size="sm">
                {setupIncomplete ? "Continuer la config." : "Configuration"}
              </Button>
            </Link>
          </div>
        }
      />

      {setupIncomplete ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-amber-950">Mise en place de l’école</p>
              <p className="mt-1 text-sm text-amber-900">
                {progress.doneRequired} / {progress.totalRequired} étapes obligatoires ·{" "}
                {progress.percent} %
              </p>
              {nextStep ? (
                <p className="mt-2 text-sm text-amber-800">
                  Prochaine étape : <strong>{nextStep.title}</strong>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {nextStep ? (
                <Link
                  to={`${nextStep.to}?setup=1`}
                  onClick={() => enterSetupGuide()}
                >
                  <Button size="sm">Continuer</Button>
                </Link>
              ) : null}
              <Link to="/ecole/configuration">
                <Button size="sm" variant="outline">
                  Voir le guide
                </Button>
              </Link>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {steps
              .filter((s) => !s.optional)
              .map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  {s.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-amber-400" />
                  )}
                  <span className={s.status === "done" ? "text-slate-600" : "text-amber-950"}>
                    {s.title}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : progress?.complete ? (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <p className="font-medium text-emerald-900">Configuration de base terminée</p>
            </div>
            <Badge tone="success">Prêt</Badge>
          </div>
        </Card>
      ) : null}

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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/annees">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <Calendar className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Années scolaires</span>
          </Card>
        </Link>
        <Link to="/emplois-du-temps">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <Calendar className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Emplois du temps</span>
          </Card>
        </Link>
        <Link to="/parents">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <Users className="h-5 w-5 text-brand-700" />
            <div>
              <span className="font-medium">Parents</span>
              <p className="text-xs text-slate-500">{stats?.parents ?? 0} compte(s)</p>
            </div>
          </Card>
        </Link>
        <Link to="/bulletins">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <ClipboardList className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Bulletins</span>
          </Card>
        </Link>
        <Link to="/ecole/configuration">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <CheckCircle2 className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Guide de configuration</span>
          </Card>
        </Link>
        <Link to="/ecole/parametres">
          <Card className="flex items-center gap-3 transition hover:border-brand-300">
            <Settings className="h-5 w-5 text-brand-700" />
            <span className="font-medium">Paramètres école</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
