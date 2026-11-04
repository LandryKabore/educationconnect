import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  EXIT_REASONS,
  FAMILY_LEVELS,
  exitReasonLabel,
  fetchIdentityGaps,
  fetchSchoolStatistics,
  setStudentIdentity,
  type SchoolStatistics,
} from "@/lib/scaleApi";
import type { AcademicYear } from "@/lib/types";
import { Badge, Button, Card, DateInputFr, EmptyState, PageHeader, Select } from "@/components/ui";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const avg = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2).replace(".", ","));
const levelLabel = (g: string | null) =>
  g ? (FAMILY_LEVELS.find((l) => l.value === g)?.label ?? g) : "Niveau non précisé";
const levelOrder = (g: string | null) => {
  const i = FAMILY_LEVELS.findIndex((l) => l.value === g);
  return i === -1 ? 99 : i;
};

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone ?? "text-slate-900"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

/** Annual statistics of the school: headcount by sex / level / class, ages, indicative pass rate, attendance, departures. */
export default function Statistiques() {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const qc = useQueryClient();
  const [yearId, setYearId] = useState("");

  const { data: years = [] } = useQuery({
    queryKey: ["statistiques-annees", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annees_scolaires")
        .select("id, label, start_date, end_date, is_current, school_id")
        .eq("school_id", schoolId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AcademicYear[];
    },
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["statistiques", schoolId, yearId],
    enabled: !!schoolId,
    queryFn: () => fetchSchoolStatistics(schoolId!, yearId || null),
  });

  const levels = useMemo(
    () => [...(stats?.byLevel ?? [])].sort((a, b) => levelOrder(a.grade) - levelOrder(b.grade) || levelLabel(a.grade).localeCompare(levelLabel(b.grade), "fr")),
    [stats],
  );
  const classes = useMemo(
    () => [...(stats?.byClass ?? [])].sort((a, b) => levelOrder(a.grade) - levelOrder(b.grade) || a.name.localeCompare(b.name, "fr")),
    [stats],
  );

  const exportXlsx = async (s: SchoolStatistics) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const t = s.totals;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Statistiques annuelles", school?.name ?? ""],
        ["Année scolaire", s.year?.label ?? ""],
        [],
        ["Effectif (élèves en classe)", t?.students ?? 0],
        ["Garçons", t?.male ?? 0],
        ["Filles", t?.female ?? 0],
        ["Sexe non renseigné", t?.unknownSex ?? 0],
        ["Date de naissance non renseignée", t?.unknownBirth ?? 0],
        ["Élèves sortis de l'école", s.departures?.total ?? 0],
        [],
        ["Taux de réussite indicatif (moyenne annuelle ≥ 10)", s.results ? pct(s.results.passed, s.results.graded) : "—"],
        ["Absences (nombre de présences marquées absent)", s.attendance?.absent ?? 0],
        ["Retards", s.attendance?.late ?? 0],
      ]),
      "Résumé",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Niveau", "Classes", "Effectif", "Garçons", "Filles", "Sexe ?", "Élèves notés", "Admis (indicatif)", "Taux", "Moyenne /20", "Taux garçons", "Taux filles"],
        ...levels.map((l) => [
          levelLabel(l.grade), l.classes, l.total, l.male, l.female, l.unknownSex, l.graded, l.passed,
          pct(l.passed, l.graded), l.average ?? "", pct(l.passedMale, l.gradedMale), pct(l.passedFemale, l.gradedFemale),
        ]),
      ]),
      "Par niveau",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Classe", "Effectif", "Garçons", "Filles", "Sexe ?", "Présences marquées", "Absences", "Retards", "Justifiées", "Élèves notés", "Admis (indicatif)", "Moyenne /20"],
        ...classes.map((c) => [
          c.name, c.total, c.male, c.female, c.unknownSex, c.attendanceRecords, c.absent, c.late, c.excused, c.graded, c.passed, c.average ?? "",
        ]),
      ]),
      "Par classe",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Âge", "Garçons", "Filles", "Sexe ?"],
        ...(s.ages ?? []).map((a) => [a.age, a.male, a.female, a.unknownSex]),
      ]),
      "Âges",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Motif de sortie", "Nombre"],
        ...Object.entries(s.departures?.byReason ?? {}).map(([k, v]) => [exitReasonLabel(k), v]),
      ]),
      "Sorties",
    );
    const label = (s.year?.label ?? "annee").replace(/[^\w-]+/g, "-");
    XLSX.writeFile(wb, `statistiques-${label}.xlsx`);
  };

  if (isLoading) return <p className="text-slate-500">Chargement…</p>;
  if (!stats || !stats.year) {
    return (
      <div>
        <PageHeader title="Statistiques" />
        <EmptyState message="Aucune année scolaire n'est définie. Créez-en une dans « Années scolaires »." />
      </div>
    );
  }

  const t = stats.totals;
  const maxAge = Math.max(1, ...(stats.ages ?? []).map((a) => a.male + a.female + a.unknownSex));
  const gapsNeeded = (t?.unknownSex ?? 0) + (t?.unknownBirth ?? 0) > 0;

  return (
    <div className="print:text-sm">
      <PageHeader
        title="Statistiques annuelles"
        subtitle={`${school?.name ?? "École"} · année ${stats.year.label}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {years.length > 1 ? (
              <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Année scolaire" className="!h-9 w-auto">
                <option value="">Année en cours</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => void exportXlsx(stats)}>
              <Download className="mr-1 h-4 w-4" />
              Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" />
              Imprimer
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Élèves en classe" value={t?.students ?? 0} hint={`${t?.classes ?? 0} classe(s)`} />
        <Stat label="Garçons" value={t?.male ?? 0} hint={pct(t?.male ?? 0, t?.students ?? 0)} tone="text-sky-700" />
        <Stat label="Filles" value={t?.female ?? 0} hint={pct(t?.female ?? 0, t?.students ?? 0)} tone="text-rose-700" />
        <Stat label="Sexe non renseigné" value={t?.unknownSex ?? 0} tone={(t?.unknownSex ?? 0) > 0 ? "text-amber-700" : "text-slate-500"} />
        <Stat label="Sortis de l'école" value={stats.departures?.total ?? 0} hint="Non comptés dans l'effectif" />
      </div>

      {gapsNeeded ? <IdentityGapsCard schoolId={schoolId!} onSaved={() => void qc.invalidateQueries({ queryKey: ["statistiques", schoolId] })} /> : null}

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Par niveau</h2>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Niveau</th>
              <th className="px-3 py-2 text-right">Classes</th>
              <th className="px-3 py-2 text-right">Effectif</th>
              <th className="px-3 py-2 text-right">Garçons</th>
              <th className="px-3 py-2 text-right">Filles</th>
              <th className="px-3 py-2 text-right">Admis*</th>
              <th className="px-3 py-2 text-right">dont garçons</th>
              <th className="px-3 py-2 text-right">dont filles</th>
              <th className="px-3 py-2 text-right">Moyenne</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.grade ?? "-"} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{levelLabel(l.grade)}</td>
                <td className="px-3 py-2 text-right">{l.classes}</td>
                <td className="px-3 py-2 text-right">{l.total}</td>
                <td className="px-3 py-2 text-right">{l.male}</td>
                <td className="px-3 py-2 text-right">{l.female}</td>
                <td className="px-3 py-2 text-right">{pct(l.passed, l.graded)}</td>
                <td className="px-3 py-2 text-right">{pct(l.passedMale, l.gradedMale)}</td>
                <td className="px-3 py-2 text-right">{pct(l.passedFemale, l.gradedFemale)}</td>
                <td className="px-3 py-2 text-right">{avg(l.average)}</td>
              </tr>
            ))}
            {stats.results ? (
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2">Total école</td>
                <td className="px-3 py-2 text-right">{t?.classes}</td>
                <td className="px-3 py-2 text-right">{t?.students}</td>
                <td className="px-3 py-2 text-right">{t?.male}</td>
                <td className="px-3 py-2 text-right">{t?.female}</td>
                <td className="px-3 py-2 text-right">{pct(stats.results.passed, stats.results.graded)}</td>
                <td className="px-3 py-2 text-right">{pct(stats.results.passedMale, stats.results.gradedMale)}</td>
                <td className="px-3 py-2 text-right">{pct(stats.results.passedFemale, stats.results.gradedFemale)}</td>
                <td className="px-3 py-2 text-right">{avg(stats.results.average)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        * Taux de réussite <strong>indicatif</strong> : élèves dont la moyenne annuelle est d'au moins 10/20, parmi ceux qui ont des notes.
        La décision officielle de passage reste celle du conseil de classe.
      </p>

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Par classe</h2>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Classe</th>
              <th className="px-3 py-2 text-right">Effectif</th>
              <th className="px-3 py-2 text-right">Garçons</th>
              <th className="px-3 py-2 text-right">Filles</th>
              <th className="px-3 py-2 text-right">Absences</th>
              <th className="px-3 py-2 text-right">Retards</th>
              <th className="px-3 py-2 text-right">Admis*</th>
              <th className="px-3 py-2 text-right">Moyenne</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.classId} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-right">{c.total}</td>
                <td className="px-3 py-2 text-right">{c.male}</td>
                <td className="px-3 py-2 text-right">{c.female}</td>
                <td className="px-3 py-2 text-right">{c.absent}</td>
                <td className="px-3 py-2 text-right">{c.late}</td>
                <td className="px-3 py-2 text-right">{pct(c.passed, c.graded)}</td>
                <td className="px-3 py-2 text-right">{avg(c.average)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        Absences et retards : nombre de fois marqués dans les présences depuis le début de l'année (pas un pourcentage).
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900">Âges des élèves</h2>
          {(stats.ages ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Aucune date de naissance renseignée.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {(stats.ages ?? []).map((a) => {
                const total = a.male + a.female + a.unknownSex;
                return (
                  <li key={a.age} className="flex items-center gap-2 text-sm">
                    <span className="w-14 shrink-0 text-slate-600">{a.age} ans</span>
                    <div className="flex h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="bg-sky-500" style={{ width: `${(a.male / maxAge) * 100}%` }} title={`${a.male} garçon(s)`} />
                      <div className="bg-rose-500" style={{ width: `${(a.female / maxAge) * 100}%` }} title={`${a.female} fille(s)`} />
                      <div className="bg-slate-400" style={{ width: `${(a.unknownSex / maxAge) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right font-medium">{total}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 flex gap-3 text-xs text-slate-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Garçons</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Filles</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Non précisé</span>
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">Sorties de l'école</h2>
          {(stats.departures?.total ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Aucun élève sorti cette année.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                {stats.departures!.total} sortie(s) : {stats.departures!.male} garçon(s), {stats.departures!.female} fille(s)
                {stats.departures!.unknownSex ? `, ${stats.departures!.unknownSex} non précisé` : ""}.
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {EXIT_REASONS.filter((r) => (stats.departures!.byReason[r.value] ?? 0) > 0).map((r) => (
                  <li key={r.value} className="flex justify-between border-b border-slate-50 pb-1">
                    <span>{r.label}</span>
                    <Badge>{stats.departures!.byReason[r.value]}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-slate-400">Édité le {format(new Date(), "d MMMM yyyy", { locale: fr })}</p>
    </div>
  );
}

/** Pupils without sex or birth date: quick fix right from the statistics page. */
function IdentityGapsCard({ schoolId, onSaved }: { schoolId: string; onSaved: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["identity-gaps", schoolId],
    queryFn: () => fetchIdentityGaps(schoolId, 30, 0),
  });
  if (!data || data.total === 0) return null;
  return (
    <Card className="mt-6 border-amber-200 bg-amber-50 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-amber-950">
          <strong>{data.total}</strong> élève(s) sans sexe ou sans date de naissance ({data.missingGender} sans sexe, {data.missingDob} sans date).
          Les statistiques sont plus justes quand tout est renseigné.
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Masquer" : "Compléter maintenant"}
        </Button>
      </div>
      {open ? (
        <ul className="mt-4 space-y-2">
          {data.rows.map((r) => (
            <GapRow
              key={r.id}
              row={r}
              onSaved={() => {
                void qc.invalidateQueries({ queryKey: ["identity-gaps", schoolId] });
                onSaved();
              }}
            />
          ))}
          {data.total > data.rows.length ? (
            <li className="text-xs text-amber-900">… et {data.total - data.rows.length} autre(s) : ils s'afficheront ici au fur et à mesure.</li>
          ) : null}
        </ul>
      ) : null}
    </Card>
  );
}

function GapRow({
  row,
  onSaved,
}: {
  row: { id: string; firstName: string; lastName: string; className: string; gender: string | null; dateOfBirth: string | null };
  onSaved: () => void;
}) {
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const needGender = !row.gender || row.gender === "other";
  const needDob = !row.dateOfBirth;
  const save = async () => {
    if ((needGender && !gender) && (needDob && !dob)) {
      toast.error("Renseignez au moins une information");
      return;
    }
    setBusy(true);
    try {
      await setStudentIdentity(row.id, needGender ? gender || null : null, needDob ? dob || null : null);
      toast.success(`${row.firstName} ${row.lastName} : enregistré`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
      <span className="min-w-[10rem] flex-1 font-medium">
        {row.firstName} {row.lastName} <span className="font-normal text-slate-500">· {row.className}</span>
      </span>
      {needGender ? (
        <Select value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Sexe" className="!h-9 w-32">
          <option value="">Sexe…</option>
          <option value="M">Garçon</option>
          <option value="F">Fille</option>
        </Select>
      ) : null}
      {needDob ? (
        <DateInputFr value={dob} onChange={setDob} minYear={new Date().getFullYear() - 35} maxYear={new Date().getFullYear() - 3} className="w-40" />
      ) : null}
      <Button size="sm" disabled={busy || (!gender && !dob)} onClick={() => void save()}>
        {busy ? "…" : "Enregistrer"}
      </Button>
    </li>
  );
}
