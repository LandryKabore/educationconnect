import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PageBanner } from "@/components/PageBanner";
import { ClassSpace } from "@/components/espace/ClassSpace";
import { fetchSpaceContext } from "@/lib/espaceClasse";

const REASONS: Record<string, string> = {
  primaire: "L’espace classe est disponible à partir de la 6ème.",
  module: "Ton école n’a pas activé l’espace classe.",
  inscription: "Tu n’es inscrit(e) dans aucune classe pour le moment.",
  auth: "Connecte-toi pour retrouver ta classe.",
};

/** « Espace classe »: the students of the class help each other (secondaire). */
export default function EspaceClasse() {
  const { user } = useAuth();
  const { data: ctx, isLoading } = useQuery({
    queryKey: ["espace-classe", "context", user?.id],
    enabled: !!user?.id,
    queryFn: fetchSpaceContext,
  });

  if (isLoading || !ctx) return <p className="text-slate-500">Chargement…</p>;
  if (!ctx.enabled) {
    return (
      <div>
        <PageBanner title="Espace classe" />
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <Users className="mx-auto h-8 w-8 text-brand-600" />
          <p className="mt-3 font-semibold text-slate-900 dark:text-slate-50">{REASONS[ctx.reason] ?? REASONS.module}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageBanner
        title={`Espace classe · ${ctx.className}`}
        subtitle="Pose tes questions, partage tes fiches et révise en groupe avec ta classe."
        stats={[{ label: "Élèves", value: String(ctx.classmates) }]}
      />
      <p className="flex items-start gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Cet espace est visible par ta classe et par l’administration de l’école. Sois bienveillant(e) ; un message déplacé peut être signalé.
      </p>
      <ClassSpace classId={ctx.classId} userId={user!.id} subjects={ctx.subjects} compositions={ctx.compositions} />
    </div>
  );
}
