import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Notes from "@/pages/enseignant/Notes";

/**
 * /classes/:id/notes — teachers manage their evaluations on « Évaluations & notes »
 * (popup to create / edit), so they are sent there on the same class and trimester.
 * School admins (and admins entering grades for a teacher) keep the class grades page.
 */
export function ClassNotesRoute() {
  const { role } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  if (role === "teacher" && id) {
    const next = new URLSearchParams({ classe: id });
    const period = params.get("period");
    if (period) next.set("trimestre", period);
    const subject = params.get("subject");
    if (subject) next.set("matiere", subject);
    if (params.get("nouveau")) next.set("nouveau", params.get("nouveau")!);
    return <Navigate to={`/devoirs?${next.toString()}`} replace />;
  }
  return <Notes />;
}
