import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Undo2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAllowVersionWrite } from "@/contexts/VersionPolicyContext";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_TONE,
  JUSTIFICATION_REASONS,
  attendanceRate,
  type AttendanceTotals,
} from "@/lib/attendance";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, ClassSection } from "@/lib/types";
import { cn, joinProfile } from "@/lib/utils";
import { usePageParams } from "@/hooks/usePageParams";
import { useRowSelection } from "@/hooks/useRowSelection";
import { BulkBar } from "@/components/BulkBar";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { Pagination } from "@/components/Pagination";
import { PersonName } from "@/components/PersonName";
import { StudentSearchPicker } from "@/components/StudentSearchPicker";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

type PresenceRow = {
  id: string;
  class_section_id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  profils: { first_name: string; last_name: string } | null;
  classes: { id: string; name: string } | null;
  matieres: { name: string } | null;
};

type StatusFilter = "absent" | "late" | "excused" | "exceptions" | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "absent", label: "À justifier" },
  { value: "late", label: "Retards" },
  { value: "excused", label: "Justifiées" },
  { value: "exceptions", label: "Toutes les absences et retards" },
  { value: "all", label: "Tout, présents compris" },
];

const SELECT_FIELDS =
  "id, class_section_id, student_id, date, status, note, profils:profils!presences_student_id_fkey(first_name, last_name), classes:classes!presences_class_section_id_fkey!inner(id, name, school_id), matieres(name)";

const MAX_SELECT_ALL = 1000;
const WRITE_CHUNK = 100;

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function PresencesEcole() {
  const { schoolId, user } = useAuth();
  const allowVersionWrite = useAllowVersionWrite();
  const qc = useQueryClient();
  const { page, pageSize, setPage, setPageSize } = usePageParams();
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("absent");
  const selection = useRowSelection<PresenceRow>();

  // the confirm dialog: rows to justify / to put back to « absent »
  const [dialog, setDialog] = useState<null | { kind: "justify" | "undo"; rows: PresenceRow[] }>(null);
  const [reason, setReason] = useState<string>(JUSTIFICATION_REASONS[0]);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  const resetPage = () => {
    setPage(1);
  };

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return sortClassesByProgression((data ?? []) as ClassSection[]);
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId, "names"],
    enabled: !!schoolId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matieres")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const rangeOk = !!from && !!to && from <= to;

  // Same filters for the list, the numbers and « select all » (query builders are loosely
  // typed here on purpose: the generated Supabase types make this helper very slow to check).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const filtered = (q: any, withStatus: boolean): any => {
    let r = q.eq("classes.school_id", schoolId!).gte("date", from).lte("date", to);
    if (classId) r = r.eq("class_section_id", classId);
    if (subjectId) r = r.eq("subject_id", subjectId);
    if (studentId) r = r.eq("student_id", studentId);
    if (withStatus) {
      if (status === "exceptions") r = r.neq("status", "present");
      else if (status !== "all") r = r.eq("status", status);
    }
    return r;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const filterKey = [schoolId, from, to, classId, subjectId, studentId];

  // Numbers for the chosen period (not affected by the « Statut » filter).
  const { data: totals } = useQuery({
    queryKey: ["ecole-presences", "kpi", ...filterKey],
    enabled: !!schoolId && rangeOk,
    queryFn: async (): Promise<AttendanceTotals> => {
      const count = async (st?: AttendanceStatus) => {
        let q = filtered(
          supabase
            .from("presences")
            .select("id, classes:classes!presences_class_section_id_fkey!inner(school_id)", {
              count: "exact",
              head: true,
            }),
          false,
        );
        if (st) q = q.eq("status", st);
        const { count: n, error } = await q;
        if (error) throw error;
        return (n ?? 0) as number;
      };
      const [total, absent, late, excused] = await Promise.all([
        count(),
        count("absent"),
        count("late"),
        count("excused"),
      ]);
      return { total, absent, late, excused, present: Math.max(total - absent - late - excused, 0) };
    },
  });

  const listQ = useQuery({
    queryKey: ["ecole-presences", "list", ...filterKey, status, page, pageSize],
    enabled: !!schoolId && rangeOk,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const q = filtered(
        supabase.from("presences").select(SELECT_FIELDS, { count: "exact" }),
        true,
      )
        .order("date", { ascending: false })
        .order("id")
        .range((page - 1) * pageSize, page * pageSize - 1);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as PresenceRow[], total: count ?? 0 };
    },
  });
  const rows = listQ.data?.rows ?? [];
  const listTotal = listQ.data?.total ?? 0;

  const rate = totals ? attendanceRate(totals) : null;

  const refresh = () => {
    for (const k of ["ecole-presences", "presences", "mes-presences", "enfant-presences", "teacher-home", "ecole-home"]) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const onFilter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    resetPage();
    selection.clear();
  };

  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const { data, error } = await filtered(
        supabase.from("presences").select(SELECT_FIELDS),
        true,
      )
        .order("date", { ascending: false })
        .order("id")
        .range(0, MAX_SELECT_ALL - 1);
      if (error) throw error;
      selection.setMany((data ?? []) as unknown as PresenceRow[], true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sélection impossible");
    } finally {
      setSelectingAll(false);
    }
  };

  const apply = async () => {
    if (!dialog || !user) return;
    const ids = dialog.rows
      .filter((r) => (dialog.kind === "justify" ? r.status === "absent" : r.status === "excused"))
      .map((r) => r.id);
    if (ids.length === 0) return;
    if (!allowVersionWrite()) return;
    const note =
      dialog.kind === "justify"
        ? [reason, extra.trim()].filter(Boolean).join(" — ")
        : null;
    setBusy(true);
    try {
      for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
        const { error } = await supabase
          .from("presences")
          .update({
            status: dialog.kind === "justify" ? "excused" : "absent",
            note,
            recorded_by: user.id,
          })
          .in("id", ids.slice(i, i + WRITE_CHUNK));
        if (error) throw error;
      }
      toast.success(
        dialog.kind === "justify"
          ? `${ids.length} absence${ids.length > 1 ? "s" : ""} justifiée${ids.length > 1 ? "s" : ""}`
          : `${ids.length} justification${ids.length > 1 ? "s" : ""} retirée${ids.length > 1 ? "s" : ""}`,
      );
      selection.clear();
      setDialog(null);
      setExtra("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setBusy(false);
    }
  };

  const selAbsent = selection.rows.filter((r) => r.status === "absent");
  const selExcused = selection.rows.filter((r) => r.status === "excused");

  const statusBadge = (r: PresenceRow) => (
    <Badge tone={ATTENDANCE_TONE[r.status]}>
      {r.status === "absent" ? "À justifier" : ATTENDANCE_LABELS[r.status]}
    </Badge>
  );

  const rowAction = (r: PresenceRow) =>
    r.status === "absent" ? (
      <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: "justify", rows: [r] })}>
        Justifier
      </Button>
    ) : r.status === "excused" ? (
      <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: "undo", rows: [r] })}>
        Retirer
      </Button>
    ) : null;

  const columns: DataTableColumn<PresenceRow>[] = [
    {
      key: "student",
      header: "Élève",
      cell: (r) => (
        <span className="font-medium text-slate-900 dark:text-slate-100">
          <PersonName first={joinProfile(r.profils)?.first_name} last={joinProfile(r.profils)?.last_name} />
        </span>
      ),
    },
    { key: "class", header: "Classe", cell: (r) => r.classes?.name ?? "—" },
    { key: "date", header: "Date", cell: (r) => fmtDay(r.date) },
    { key: "subject", header: "Cours", cell: (r) => r.matieres?.name ?? "—", hideBelowLg: true },
    {
      key: "status",
      header: "Statut",
      cell: (r) => (
        <div className="space-y-0.5">
          {statusBadge(r)}
          {r.status === "excused" && r.note ? (
            <p className="max-w-[16rem] truncate text-xs text-slate-500" title={r.note}>
              {r.note}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "action",
      header: "",
      className: "text-right whitespace-nowrap",
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/classes/${r.class_section_id}/presences?date=${r.date}`}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Appel
          </Link>
          {rowAction(r)}
        </div>
      ),
    },
  ];

  const pageCount = Math.max(1, Math.ceil(listTotal / pageSize));
  const canSelectAll = listTotal > rows.length && listTotal <= MAX_SELECT_ALL;
  const allMatchingSelected = listTotal > 0 && selection.count >= listTotal;

  const dialogRows = useMemo(
    () =>
      dialog
        ? dialog.rows.filter((r) => (dialog.kind === "justify" ? r.status === "absent" : r.status === "excused"))
        : [],
    [dialog],
  );

  return (
    <div className={cn(selection.count > 0 && "pb-24")}>
      <PageHeader
        title="Présences"
        subtitle="Passez en revue les absences et justifiez-les en lot"
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div>
            <Label htmlFor="pe-from">Du</Label>
            <Input id="pe-from" type="date" max={to || undefined} value={from} onChange={(e) => onFilter(setFrom)(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pe-to">Au</Label>
            <Input id="pe-to" type="date" min={from || undefined} value={to} onChange={(e) => onFilter(setTo)(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pe-class">Classe</Label>
            <Select id="pe-class" value={classId} onChange={(e) => onFilter(setClassId)(e.target.value)}>
              <option value="">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pe-subject">Matière</Label>
            <Select id="pe-subject" value={subjectId} onChange={(e) => onFilter(setSubjectId)(e.target.value)}>
              <option value="">Toutes les matières</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <Label htmlFor="pe-status">Statut</Label>
            <Select id="pe-status" value={status} onChange={(e) => onFilter(setStatus)(e.target.value as StatusFilter)}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <Label>Élève</Label>
            {schoolId ? (
              <StudentSearchPicker
                schoolId={schoolId}
                value={studentId}
                onChange={onFilter(setStudentId)}
                placeholder="Rechercher un élève"
              />
            ) : null}
          </div>
        </div>
      </Card>

      {!rangeOk ? (
        <EmptyState message="Choisissez une période valide (la date de début doit précéder la date de fin)." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Présence</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{rate === null ? "—" : `${rate.toLocaleString("fr-FR")} %`}</p>
              <p className="text-xs text-slate-500">{totals ? `${totals.total.toLocaleString("fr-FR")} cours` : "…"}</p>
            </Card>
            <Card className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">À justifier</p>
              <p className="mt-1 text-2xl font-bold text-rose-600">{totals ? totals.absent.toLocaleString("fr-FR") : "…"}</p>
              <p className="text-xs text-slate-500">absences non justifiées</p>
            </Card>
            <Card className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retards</p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{totals ? totals.late.toLocaleString("fr-FR") : "…"}</p>
              <p className="text-xs text-slate-500">sur la période</p>
            </Card>
            <Card className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Justifiées</p>
              <p className="mt-1 text-2xl font-bold text-sky-600">{totals ? totals.excused.toLocaleString("fr-FR") : "…"}</p>
              <p className="text-xs text-slate-500">ne comptent pas comme absences</p>
            </Card>
          </div>

          {listQ.isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : listQ.isError ? (
            <EmptyState message="Impossible de charger les présences. Réessayez plus tard." />
          ) : listTotal === 0 ? (
            <EmptyState message="Aucune présence ne correspond à ces filtres." />
          ) : (
            <Card className="overflow-hidden p-0">
              {canSelectAll || selection.count > 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-[var(--surface-2)] dark:text-slate-300">
                  {allMatchingSelected ? (
                    <span>Les {listTotal} résultats sont sélectionnés.</span>
                  ) : canSelectAll ? (
                    <button
                      type="button"
                      className="font-medium text-brand-700 hover:underline disabled:opacity-60"
                      disabled={selectingAll}
                      onClick={() => void selectAllMatching()}
                    >
                      {selectingAll ? "Sélection…" : `Sélectionner les ${listTotal} résultats`}
                    </button>
                  ) : null}
                  {selection.count > 0 ? (
                    <button type="button" className="text-slate-500 hover:underline" onClick={selection.clear}>
                      Tout désélectionner
                    </button>
                  ) : null}
                </div>
              ) : null}
              <DataTable
                rows={rows}
                columns={columns}
                dimmed={listQ.isFetching}
                selectedIds={selection.ids}
                onToggle={selection.toggle}
                onTogglePage={selection.setMany}
                rowLabel={(r) => `Sélectionner ${joinProfile(r.profils)?.first_name ?? ""} ${joinProfile(r.profils)?.last_name ?? ""} le ${fmtDay(r.date)}`}
                mobileRow={(r) => (
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        <PersonName first={joinProfile(r.profils)?.first_name} last={joinProfile(r.profils)?.last_name} />
                      </p>
                      {statusBadge(r)}
                    </div>
                    <p className="text-xs text-slate-500">
                      {r.classes?.name ?? "—"} · {fmtDay(r.date)}
                      {r.matieres?.name ? ` · ${r.matieres.name}` : ""}
                    </p>
                    {r.status === "excused" && r.note ? <p className="text-xs text-slate-500">{r.note}</p> : null}
                    <div className="flex items-center gap-3">
                      {rowAction(r)}
                      <Link to={`/classes/${r.class_section_id}/presences?date=${r.date}`} className="text-xs font-medium text-brand-700 hover:underline">
                        Voir l’appel
                      </Link>
                    </div>
                  </div>
                )}
              />
              <Pagination
                total={listTotal}
                page={Math.min(page, pageCount)}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="ligne"
                busy={listQ.isFetching}
              />
            </Card>
          )}
        </>
      )}

      <BulkBar count={selection.count} noun="ligne" onClear={selection.clear}>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={selAbsent.length === 0}
          onClick={() => setDialog({ kind: "justify", rows: selAbsent })}
        >
          <CheckCircle2 className="h-4 w-4" />
          Justifier ({selAbsent.length})
        </Button>
        {selExcused.length > 0 ? (
          <Button type="button" size="sm" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setDialog({ kind: "undo", rows: selExcused })}>
            <Undo2 className="h-4 w-4" />
            Retirer la justification ({selExcused.length})
          </Button>
        ) : null}
        {selection.count > selAbsent.length + selExcused.length ? (
          <span className="text-xs text-slate-300">
            {selection.count - selAbsent.length - selExcused.length} retard(s) ou présence(s) ignoré(s)
          </span>
        ) : null}
      </BulkBar>

      <Modal
        open={!!dialog}
        title={dialog?.kind === "undo" ? "Retirer la justification" : "Justifier les absences"}
        onClose={() => setDialog(null)}
        closeDisabled={busy}
      >
        {dialog ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {dialog.kind === "justify" ? (
                <>
                  <strong>{dialogRows.length}</strong> absence{dialogRows.length > 1 ? "s" : ""} seront justifiée
                  {dialogRows.length > 1 ? "s" : ""} et ne compteront plus comme absences.
                </>
              ) : (
                <>
                  <strong>{dialogRows.length}</strong> justification{dialogRows.length > 1 ? "s" : ""} seront retirée
                  {dialogRows.length > 1 ? "s" : ""} : les cours redeviennent des absences non justifiées.
                </>
              )}
            </p>
            {dialog.kind === "justify" ? (
              <>
                <div>
                  <Label>Motif</Label>
                  <div className="flex flex-wrap gap-2">
                    {JUSTIFICATION_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={reason === r}
                        onClick={() => setReason(r)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                          reason === r
                            ? "border-brand-600 bg-brand-50 text-brand-800"
                            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="pe-extra">Précision (facultatif)</Label>
                  <Input id="pe-extra" maxLength={200} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ex. : certificat reçu le 3 novembre" />
                </div>
              </>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
                Annuler
              </Button>
              <Button type="button" disabled={busy || dialogRows.length === 0} onClick={() => void apply()}>
                {busy ? "Enregistrement…" : dialog.kind === "justify" ? "Justifier" : "Retirer"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
