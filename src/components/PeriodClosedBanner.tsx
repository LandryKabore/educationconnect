import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/** Shown on grade screens when the period is closed. */
export function PeriodClosedBanner({ periodLabel }: { periodLabel: string }) {
  const { role } = useAuth();
  const isAdmin = role === "school_admin" || role === "super_admin";
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">{periodLabel} est clôturé.</span> Les notes sont verrouillées : plus
        aucune note ni évaluation de cette période ne peut être ajoutée, modifiée ou supprimée.{" "}
        {isAdmin
          ? "Vous pouvez rouvrir la période dans « Périodes » (une raison est demandée)."
          : "Pour corriger une note, demandez à l’administration de rouvrir la période."}
      </p>
    </div>
  );
}
