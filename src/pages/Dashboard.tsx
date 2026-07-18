import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@/lib/types";
import { Card, PageHeader } from "@/components/ui";
import { PortalGreeting } from "@/components/PortalGreeting";
import StudentHome from "@/pages/eleve/StudentHome";
import TeacherHome from "@/pages/enseignant/TeacherHome";
import ParentHome from "@/pages/parent/ParentHome";

export default function Dashboard() {
  const { role, schoolId } = useAuth();

  if (role === "student") return <StudentHome />;
  if (role === "teacher") return <TeacherHome />;
  if (role === "parent") return <ParentHome />;

  return (
    <div>
      <PortalGreeting />
      <PageHeader
        title="Tableau de bord"
        subtitle={role ? ROLE_LABELS[role] : undefined}
      />

      {role === "school_admin" ? (
        <Card>
          <p className="text-sm text-slate-600">
            La vue d’ensemble de l’établissement se trouve dans{" "}
            <Link to="/ecole" className="font-medium text-brand-700 underline">
              Mon école
            </Link>
            .
          </p>
        </Card>
      ) : null}

      {!role && schoolId ? (
        <p className="mt-4 text-sm text-slate-500">Aucun rôle actif détecté.</p>
      ) : null}
    </div>
  );
}
