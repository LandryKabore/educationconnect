import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCahierCoverage } from "@/lib/scaleApi";
import { Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui";

const PERIODS = [
  { value: "7", label: "7 derniers jours" },
  { value: "14", label: "14 derniers jours" },
  { value: "30", label: "30 derniers jours" },
];

/** School admin: who fills the lesson log, per class and subject. */
export default function CahierEcole() {
  const { schoolId } = useAuth();
  const [days, setDays] = useState("14");
  const [classFilter, setClassFilter] = useState("");
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(addDays(new Date(), -Number(days)), "yyyy-MM-dd");

  const { data = [], isLoading } = useQuery({
    queryKey: ["cahier-couverture", schoolId, from, to],
    enabled: !!schoolId,
    queryFn: () => fetchCahierCoverage(schoolId!, from, to),
  });

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => m.set(r.classId, r.className));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [data]);
  const rows = data.filter((r) => !classFilter || r.classId === classFilter);
  const empty = rows.filter((r) => r.entries === 0).length;

  return (
    <div>
      <PageHeader
        title="Cahier de textes — suivi"
        subtitle="Quels enseignants remplissent le cahier de textes de leur classe"
        actions={
          <div className="flex gap-2">
            <Select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Période" className="!h-9 w-auto">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Classe" className="!h-9 w-auto">
              <option value="">Toutes les classes</option>
              {classes.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune matière affectée à un enseignant : le suivi apparaîtra quand les enseignants seront affectés aux classes." />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {empty > 0 ? (
              <>
                <strong className="text-amber-700">{empty}</strong> matière(s) sans aucune saisie sur la période.
              </>
            ) : (
              "Toutes les matières ont au moins une saisie sur la période."
            )}
          </p>
          <Card className="overflow-x-auto !p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Classe</th>
                  <th className="px-3 py-2">Matière</th>
                  <th className="px-3 py-2">Enseignant</th>
                  <th className="px-3 py-2 text-right">Cours / semaine</th>
                  <th className="px-3 py-2 text-right">Saisies</th>
                  <th className="px-3 py-2">Dernière saisie</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.classId}-${r.subjectId}-${r.teacherId}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{r.className}</td>
                    <td className="px-3 py-2">{r.subject}</td>
                    <td className="px-3 py-2 text-slate-600">{r.teacher ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.slotsPerWeek || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {r.entries === 0 ? <Badge tone="warning">0</Badge> : <Badge tone="success">{r.entries}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.lastDate ? format(new Date(`${r.lastDate}T12:00:00`), "d MMM yyyy", { locale: fr }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
