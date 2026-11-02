import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import { Modal } from "@/components/Modal";

type HistoryRow = {
  id: string;
  note_id: string;
  evaluation_id: string | null;
  student_id: string;
  action: "update" | "delete";
  old_score: number | null;
  new_score: number | null;
  old_max_score: number | null;
  new_max_score: number | null;
  old_is_absent: boolean | null;
  new_is_absent: boolean | null;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Omit to list every change the user is allowed to see (e.g. whole school for an admin) */
  classSectionId?: string;
  subjectId?: string;
  periodLabel?: string;
  /** Limit to one évaluation */
  evaluationId?: string;
  title?: string;
};

function show(score: number | null, max: number | null, absent: boolean | null) {
  if (absent) return "Absent";
  if (score === null || score === undefined) return "—";
  return `${score}${max ? ` / ${max}` : ""}`;
}

/**
 * « Historique des modifications » : who changed which grade, when, from what to what.
 * Read from `notes_historique` (filled by the database; visible to the school admin and to the
 * teachers of that class and subject only).
 */
export function NotesHistoryModal({
  open,
  onClose,
  classSectionId,
  subjectId,
  periodLabel,
  evaluationId,
  title = "Historique des modifications de notes",
}: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["notes-history", classSectionId, subjectId, periodLabel, evaluationId],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("notes_historique")
        .select(
          "id, note_id, evaluation_id, student_id, action, old_score, new_score, old_max_score, new_max_score, old_is_absent, new_is_absent, changed_by, changed_at, reason",
        )
        .order("changed_at", { ascending: false })
        .limit(200);
      if (classSectionId) q = q.eq("class_section_id", classSectionId);
      if (subjectId) q = q.eq("subject_id", subjectId);
      if (periodLabel) q = q.eq("period_label", periodLabel);
      if (evaluationId) q = q.eq("evaluation_id", evaluationId);
      const { data: rows, error: err } = await q;
      if (err) throw err;
      const list = (rows ?? []) as HistoryRow[];

      const personIds = [
        ...new Set(list.flatMap((r) => [r.student_id, r.changed_by]).filter((v): v is string => !!v)),
      ];
      const evalIds = [...new Set(list.map((r) => r.evaluation_id).filter((v): v is string => !!v))];

      const people = new Map<string, string>();
      if (personIds.length > 0) {
        const { data: profs } = await supabase
          .from("profils")
          .select("id, first_name, last_name")
          .in("id", personIds);
        for (const p of (profs ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
          people.set(p.id, fullName(p.first_name, p.last_name));
        }
      }
      const evals = new Map<string, string>();
      if (evalIds.length > 0) {
        const { data: evs } = await supabase.from("evaluations").select("id, title").in("id", evalIds);
        for (const e of (evs ?? []) as { id: string; title: string }[]) evals.set(e.id, e.title);
      }
      return { list, people, evals };
    },
  });

  return (
    <Modal open={open} title={title} onClose={onClose} size="xl">
      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Historique indisponible.</p>
      ) : !data || data.list.length === 0 ? (
        <p className="text-sm text-slate-600">
          Aucune modification enregistrée. L’historique garde chaque changement ou suppression de note
          faite après la première saisie.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Élève</th>
                <th className="py-2 pr-3">Évaluation</th>
                <th className="py-2 pr-3">Avant</th>
                <th className="py-2 pr-3">Après</th>
                <th className="py-2">Par</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-700">
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-600">
                    {new Date(r.changed_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="py-2 pr-3 font-medium">{data.people.get(r.student_id) ?? "—"}</td>
                  <td className="py-2 pr-3">{(r.evaluation_id && data.evals.get(r.evaluation_id)) || "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {show(r.old_score, r.old_max_score, r.old_is_absent)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {r.action === "delete" ? (
                      <span className="font-medium text-red-700">Supprimée</span>
                    ) : (
                      show(r.new_score, r.new_max_score, r.new_is_absent)
                    )}
                  </td>
                  <td className="py-2">
                    {r.changed_by ? (data.people.get(r.changed_by) ?? "—") : "Système"}
                    {r.reason ? <span className="block text-xs text-slate-500">{r.reason}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.list.length >= 200 ? (
            <p className="mt-3 text-xs text-slate-500">Les 200 modifications les plus récentes sont affichées.</p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
