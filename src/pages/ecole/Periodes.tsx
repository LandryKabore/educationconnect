import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Lock, LockOpen, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear } from "@/lib/types";
import { TRIMESTER_PERIODS } from "@/lib/averages";
import { isoToFr } from "@/lib/dateFr";
import { fullName } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { NotesHistoryModal } from "@/components/NotesHistoryModal";
import {
  Badge,
  Button,
  Card,
  DateInputFr,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

type PeriodRow = {
  id: string;
  academic_year_id: string;
  label: string;
  status: "ouverte" | "cloturee";
  start_date: string | null;
  end_date: string | null;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
};

type Bounds = { start_date: string; end_date: string; source: string };

type CloseSummary = {
  classes: number;
  classes_with_notes: number;
  classes_without_notes: number;
  notes: number;
  evaluations: number;
  invalid_notes: number;
};

type LogRow = {
  id: string;
  action: "close" | "reopen" | "dates";
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  period_id: string;
};

const ACTION_LABEL: Record<LogRow["action"], string> = {
  close: "Clôture",
  reopen: "Réouverture",
  dates: "Dates modifiées",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * School admin: close a period (trimester) so its grades are locked, reopen it (with a reason),
 * set its dates, and read the closing journal. The lock itself is enforced by the database.
 */
export default function Periodes() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: years = [], isLoading: yearsLoading } = useQuery({
    queryKey: ["annees", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annees_scolaires")
        .select("*")
        .eq("school_id", schoolId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as AcademicYear[];
    },
  });

  useEffect(() => {
    if (yearId || years.length === 0) return;
    setYearId((years.find((y) => y.is_current) ?? years[0]).id);
  }, [years, yearId]);

  const periodsKey = ["periodes", schoolId, yearId];
  const { data: stored = [] } = useQuery({
    queryKey: periodsKey,
    enabled: !!schoolId && !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periodes_scolaires")
        .select(
          "id, academic_year_id, label, status, start_date, end_date, closed_at, closed_by, reopened_at, reopen_reason",
        )
        .eq("school_id", schoolId!)
        .eq("academic_year_id", yearId);
      if (error) throw error;
      return (data ?? []) as PeriodRow[];
    },
  });

  const { data: bounds = {} } = useQuery({
    queryKey: ["periodes-bornes", yearId, stored.map((p) => `${p.label}${p.start_date}${p.end_date}`).join()],
    enabled: !!yearId,
    queryFn: async () => {
      const out: Record<string, Bounds | null> = {};
      for (const label of TRIMESTER_PERIODS) {
        const { data } = await supabase.rpc("ef_period_bounds_for_year", {
          p_academic_year_id: yearId,
          p_label: label,
        });
        const row = (Array.isArray(data) ? data[0] : data) as Bounds | undefined;
        out[label] = row ?? null;
      }
      return out;
    },
  });

  const { data: log = [] } = useQuery({
    queryKey: ["periodes-log", schoolId, yearId, stored.map((p) => p.closed_at ?? p.reopened_at).join()],
    enabled: !!schoolId && stored.length > 0,
    queryFn: async () => {
      const ids = stored.map((p) => p.id);
      const { data, error } = await supabase
        .from("periodes_scolaires_log")
        .select("id, action, actor_id, reason, created_at, period_id")
        .in("period_id", ids)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = (data ?? []) as LogRow[];
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))];
      const names = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profils")
          .select("id, first_name, last_name")
          .in("id", actorIds);
        for (const p of (profs ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
          names.set(p.id, fullName(p.first_name, p.last_name));
        }
      }
      return rows.map((r) => ({ ...r, actor: r.actor_id ? (names.get(r.actor_id) ?? "—") : "Système" }));
    },
  });

  const byLabel = useMemo(() => new Map(stored.map((p) => [p.label, p])), [stored]);
  const labelOf = (periodId: string) => stored.find((p) => p.id === periodId)?.label ?? "";

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["periodes", schoolId] });
    void qc.invalidateQueries({ queryKey: ["periodes-bornes"] });
    void qc.invalidateQueries({ queryKey: ["periodes-log"] });
    void qc.invalidateQueries({ queryKey: ["period-closed"] });
  };

  const year = years.find((y) => y.id === yearId);

  return (
    <div>
      <PageHeader
        title="Périodes et clôture"
        subtitle="Clôturez un trimestre pour verrouiller ses notes. Chaque modification de note est gardée dans l’historique."
        actions={
          <Button variant="outline" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4" />
            Historique des notes
          </Button>
        }
      />

      {yearsLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : years.length === 0 ? (
        <EmptyState message="Créez d’abord une année scolaire." />
      ) : (
        <>
          <div className="mb-5 max-w-xs">
            <Label htmlFor="periodes-annee">Année scolaire</Label>
            <Select id="periodes-annee" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.is_current ? " (courante)" : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-3">
            {TRIMESTER_PERIODS.map((label) => {
              const p = byLabel.get(label);
              const closed = p?.status === "cloturee";
              const b = bounds[label];
              const start = p?.start_date ?? b?.start_date ?? null;
              const end = p?.end_date ?? b?.end_date ?? null;
              const fromDefault = !(p?.start_date && p?.end_date);
              return (
                <Card key={label} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{label}</h3>
                      {closed ? (
                        <Badge tone="warning">
                          <span className="inline-flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Clôturé
                          </span>
                        </Badge>
                      ) : (
                        <Badge tone="success">Ouvert</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {start && end ? `Du ${isoToFr(start)} au ${isoToFr(end)}` : "Dates non définies"}
                      {fromDefault && start ? " (dates par défaut : année divisée en 3)" : ""}
                    </p>
                    {closed && p?.closed_at ? (
                      <p className="mt-0.5 text-xs text-slate-500">Clôturé le {fmtDateTime(p.closed_at)}</p>
                    ) : null}
                    {!closed && p?.reopened_at ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Rouvert le {fmtDateTime(p.reopened_at)}
                        {p.reopen_reason ? ` — ${p.reopen_reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(label)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Dates
                    </Button>
                    {closed ? (
                      <Button size="sm" variant="outline" onClick={() => setReopening(label)}>
                        <LockOpen className="h-3.5 w-3.5" />
                        Rouvrir
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setClosing(label)}>
                        <Lock className="h-3.5 w-3.5" />
                        Clôturer
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <p className="mt-4 max-w-2xl text-xs text-slate-500">
            Les dates servent à compter les absences de chaque bulletin : seules les absences de la période
            comptent. Tant que vous n’avez pas saisi de dates, l’année est divisée en trois parts égales.
          </p>

          {log.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Journal</h2>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Période</th>
                      <th className="px-4 py-2">Action</th>
                      <th className="px-4 py-2">Par</th>
                      <th className="px-4 py-2">Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700">
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fmtDateTime(r.created_at)}</td>
                        <td className="px-4 py-2">{labelOf(r.period_id)}</td>
                        <td className="px-4 py-2 font-medium">{ACTION_LABEL[r.action]}</td>
                        <td className="px-4 py-2">{r.actor}</td>
                        <td className="px-4 py-2 text-slate-600">{r.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : null}
        </>
      )}

      {closing && schoolId && yearId ? (
        <CloseModal
          schoolId={schoolId}
          yearId={yearId}
          yearLabel={year?.label ?? ""}
          label={closing}
          start={byLabel.get(closing)?.start_date ?? bounds[closing]?.start_date ?? ""}
          end={byLabel.get(closing)?.end_date ?? bounds[closing]?.end_date ?? ""}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            refresh();
          }}
        />
      ) : null}
      {reopening && schoolId && yearId ? (
        <ReopenModal
          schoolId={schoolId}
          yearId={yearId}
          label={reopening}
          onClose={() => setReopening(null)}
          onDone={() => {
            setReopening(null);
            refresh();
          }}
        />
      ) : null}
      {editing && schoolId && yearId ? (
        <DatesModal
          schoolId={schoolId}
          yearId={yearId}
          label={editing}
          start={byLabel.get(editing)?.start_date ?? bounds[editing]?.start_date ?? ""}
          end={byLabel.get(editing)?.end_date ?? bounds[editing]?.end_date ?? ""}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      <NotesHistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Historique des modifications de notes (toute l’école)"
      />
    </div>
  );
}

type ModalCommon = {
  schoolId: string;
  yearId: string;
  label: string;
  onClose: () => void;
  onDone: () => void;
};

function CloseModal({
  schoolId,
  yearId,
  yearLabel,
  label,
  start: start0,
  end: end0,
  onClose,
  onDone,
}: ModalCommon & { yearLabel: string; start: string; end: string }) {
  const [start, setStart] = useState(start0);
  const [end, setEnd] = useState(end0);
  const [saving, setSaving] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["periode-resume", schoolId, yearId, label],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ef_period_close_summary", {
        p_school_id: schoolId,
        p_academic_year_id: yearId,
        p_label: label,
      });
      if (error) throw error;
      return data as CloseSummary;
    },
  });

  const submit = async () => {
    if (start && end && end < start) {
      toast.error("La date de fin doit être après la date de début");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("ef_close_period", {
      p_school_id: schoolId,
      p_academic_year_id: yearId,
      p_label: label,
      p_start: start || null,
      p_end: end || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Clôture impossible");
      return;
    }
    toast.success(`${label} clôturé : les notes sont verrouillées`);
    onDone();
  };

  return (
    <Modal open title={`Clôturer le ${label} ?`} onClose={onClose} closeDisabled={saving}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Année scolaire {yearLabel}. Après la clôture, plus personne (même l’administration) ne peut ajouter,
          modifier ou supprimer une note ou une évaluation de cette période, sauf si vous la rouvrez avec une
          raison.
        </p>
        {isLoading ? (
          <p className="text-slate-500">Calcul en cours…</p>
        ) : summary ? (
          <ul className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <li>
              <b>{summary.notes}</b> note(s) dans <b>{summary.evaluations}</b> évaluation(s)
            </li>
            <li>
              <b>{summary.classes_with_notes}</b> classe(s) sur {summary.classes} ont des notes
            </li>
            {summary.classes_without_notes > 0 ? (
              <li className="text-amber-800 dark:text-amber-300">
                {summary.classes_without_notes} classe(s) sans aucune note pour cette période
              </li>
            ) : null}
            {summary.invalid_notes > 0 ? (
              <li className="font-medium text-red-700 dark:text-red-400">
                {summary.invalid_notes} note(s) hors limites (par ex. supérieure au maximum). Corrigez-les avant
                de clôturer : après la clôture, il faudra rouvrir la période pour le faire.
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="per-debut">Début de la période</Label>
            <DateInputFr id="per-debut" value={start} onChange={setStart} />
          </div>
          <div>
            <Label htmlFor="per-fin">Fin de la période</Label>
            <DateInputFr id="per-fin" value={end} onChange={setEnd} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void submit()} disabled={saving || isLoading}>
            <Lock className="h-4 w-4" />
            {saving ? "Clôture…" : "Clôturer la période"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReopenModal({ schoolId, yearId, label, onClose, onDone }: ModalCommon) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error("Indiquez la raison (5 caractères minimum)");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("ef_reopen_period", {
      p_school_id: schoolId,
      p_academic_year_id: yearId,
      p_label: label,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Réouverture impossible");
      return;
    }
    toast.success(`${label} rouvert`);
    onDone();
  };

  return (
    <Modal open title={`Rouvrir le ${label} ?`} onClose={onClose} closeDisabled={saving}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Les notes de cette période pourront de nouveau être modifiées. La raison est gardée dans le journal.
          Pensez à clôturer de nouveau après la correction.
        </p>
        <div>
          <Label htmlFor="per-raison">Raison de la réouverture</Label>
          <Textarea
            id="per-raison"
            className="min-h-24"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Ex. : erreur de saisie en Mathématiques, 6e A"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Réouverture…" : "Rouvrir la période"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DatesModal({
  schoolId,
  yearId,
  label,
  start: start0,
  end: end0,
  onClose,
  onDone,
}: ModalCommon & { start: string; end: string }) {
  const [start, setStart] = useState(start0);
  const [end, setEnd] = useState(end0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!start || !end) {
      toast.error("Indiquez les deux dates (jj/mm/aaaa)");
      return;
    }
    if (end < start) {
      toast.error("La date de fin doit être après la date de début");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("ef_set_period_dates", {
      p_school_id: schoolId,
      p_academic_year_id: yearId,
      p_label: label,
      p_start: start,
      p_end: end,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Enregistrement impossible");
      return;
    }
    toast.success("Dates enregistrées");
    onDone();
  };

  return (
    <Modal open title={`Dates — ${label}`} onClose={onClose} closeDisabled={saving}>
      <div className="space-y-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dates-debut">Début</Label>
            <DateInputFr id="dates-debut" value={start} onChange={setStart} required />
          </div>
          <div>
            <Label htmlFor="dates-fin">Fin</Label>
            <DateInputFr id="dates-fin" value={end} onChange={setEnd} required />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Seules les absences et retards entre ces deux dates comptent sur le bulletin de cette période.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </div>
      </div>
    </Modal>
  );
}
