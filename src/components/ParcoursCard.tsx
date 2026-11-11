import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge, Card } from "@/components/ui";
import { exitReasonLabel, fetchParcours, type ParcoursRow } from "@/lib/scaleApi";

const ENTRY_LABEL: Record<ParcoursRow["entry_kind"], string> = {
  inscription: "Inscription",
  changement_classe: "Changement de classe",
  reintegration: "Réintégration",
};

const d = (iso: string) => format(new Date(iso), "d MMM yyyy", { locale: fr });

/** Class history of a pupil: every class he/she was in, with the dates. Kept even after a class change or a departure. */
export function ParcoursCard({ studentId }: { studentId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["parcours", studentId],
    queryFn: () => fetchParcours(studentId),
  });

  return (
    <Card>
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Parcours scolaire</h3>
      {isLoading ? (
        <p className="mt-3 text-sm text-slate-500">Chargement…</p>
      ) : data.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Aucun historique de classe pour le moment.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4 dark:border-slate-700">
          {data.map((row) => (
            <li key={row.id} className="relative text-sm">
              <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" />
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {row.class_name ?? "Classe supprimée"}
                {row.year_label ? <span className="font-normal text-slate-500"> · {row.year_label}</span> : null}
              </p>
              <p className="text-xs text-slate-500">
                {ENTRY_LABEL[row.entry_kind]} le {d(row.from_date)}
                {row.to_date ? ` → jusqu'au ${d(row.to_date)}` : " → en cours"}
              </p>
              {row.end_kind === "sortie" ? (
                <Badge tone="warning">Sortie · {exitReasonLabel(row.exit_reason)}</Badge>
              ) : row.end_kind === "changement_classe" ? (
                <Badge tone="info">A changé de classe</Badge>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
