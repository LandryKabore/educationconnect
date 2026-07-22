import { useAuth } from "@/contexts/AuthContext";
import MonEmploiDuTemps from "@/pages/eleve/MonEmploiDuTemps";
import MonEmploiDuTempsProf from "@/pages/enseignant/MonEmploiDuTempsProf";

/** Student vs teacher timetable — same URL, different view. */
export default function MonEmploiDuTempsPage() {
  const { role } = useAuth();
  if (role === "teacher") return <MonEmploiDuTempsProf />;
  return <MonEmploiDuTemps />;
}
