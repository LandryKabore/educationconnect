import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { ArrowDownRight, ArrowUpRight, PenLine } from "lucide-react";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { EmptyState } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useNotesPendingChanges } from "@/hooks/useNotesRealtime";
import { useResolvedGradingPeriod } from "@/hooks/useGradingPeriodState";
import {
  bulletinMention,
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  programmeToCoefMap,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { formatDateSafe } from "@/lib/dateFr";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Grade = GradeRow & {
  matieres: Subject;
  evaluations: { type: EvaluationType; title: string; eval_date: string | null } | null;
};

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export default function MesNotes() {
  const { user } = useAuth();
  const { markSeen } = useNotesPendingChanges();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const { data: enrollment } = useQuery({
    queryKey: ["mon-inscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as { class_section_id: string } | null;
    },
  });

  const { data: coefMap = {} } = useQuery({
    queryKey: ["programme-coefs", enrollment?.class_section_id],
    enabled: !!enrollment?.class_section_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", enrollment!.class_section_id);
      return programmeToCoefMap(data ?? []);
    },
  });

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ["mes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*), evaluations(type, title, eval_date)")
        .eq("student_id", user!.id)
        .order("period_label");
      if (error) throw error;
      return data as Grade[];
    },
  });

  // the school's current trimester (same choice as the bulletin)
  const { suggested } = useResolvedGradingPeriod(TRIMESTER_PERIODS, {
    classSectionId: enrollment?.class_section_id,
  });
  const period = suggested ?? TRIMESTER_PERIODS[0];

  const annual = useMemo(
    () => computeAnnualAverage(grades, { coefficientBySubject: coefMap }),
    [grades, coefMap],
  );
  const periodAverage = useMemo(
    () =>
      computeWeightedAverage(
        grades.filter((g) => g.period_label === period),
        { coefficientBySubject: coefMap },
      ).generalAverage,
    [grades, coefMap, period],
  );
  const index = TRIMESTER_PERIODS.indexOf(period as (typeof TRIMESTER_PERIODS)[number]);
  const previous = index > 0 ? (annual.trimesters[index - 1]?.generalAverage ?? null) : null;
  const delta = periodAverage != null && previous != null ? periodAverage - previous : null;

  const latest = useMemo(() => {
    const sorted = [...grades].sort((a, b) =>
      ((b as { created_at?: string }).created_at ?? "").localeCompare((a as { created_at?: string }).created_at ?? ""),
    );
    return sorted[0] ?? null;
  }, [grades]);

  return (
    // squarer corners on this page only: the shared tables keep their radius elsewhere
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Banner: same teal gradient and effects as the home banner */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Résultats scolaires</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">Mes notes</h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                Moyennes calculées avec les coefficients de ta classe, comme sur le bulletin.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat
                label={period}
                value={periodAverage != null ? formatAverage(periodAverage, 2) : "—"}
                hint={
                  periodAverage == null ? (
                    "Pas encore de note"
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {bulletinMention(periodAverage)}
                      {delta != null && Math.abs(delta) > 0.05 ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 font-bold",
                            delta > 0 ? "bg-emerald-400/25 text-emerald-50" : "bg-rose-400/25 text-rose-50",
                          )}
                        >
                          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatAverage(Math.abs(delta), 1)}
                        </span>
                      ) : null}
                    </span>
                  )
                }
              />
              <BannerStat
                to="/mon-bulletin"
                label="Moyenne annuelle"
                value={annual.annualAverage != null ? formatAverage(annual.annualAverage, 2) : "—"}
                hint={
                  annual.annualAverage != null
                    ? `${formatPassDecision(annual)}${!annual.complete ? " · provisoire" : ""}`
                    : "Pas encore de note"
                }
              />
              <BannerStat label="Notes publiées" value={String(grades.length)} hint="depuis le début de l’année" />
            </div>
          </div>
          <div className="lg:col-span-5">
            <LatestGradeCard grade={latest} />
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note publiée pour le moment." />
      ) : (
        <NotesPeriodTables grades={grades} coefficientBySubject={coefMap} showEvaluation />
      )}
    </div>
  );
}

function BannerStat({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint: React.ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums lg:text-[1.75rem]">{value}</p>
      <div className="mt-0.5 truncate text-xs text-white/80">{hint}</div>
    </>
  );
  const cls = "block rounded-md bg-white/10 p-3.5 ring-1 ring-white/15";
  return to ? (
    <Link to={to} className={cn(cls, "transition hover:bg-white/15")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** White card in the banner: the most recent grade, like "Prochain cours" on the home. */
function LatestGradeCard({ grade }: { grade: Grade | null }) {
  if (!grade) {
    return (
      <div className="rounded-md bg-white/10 p-5 ring-1 ring-white/15">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Dernière note</p>
        <p className="mt-2 text-lg font-semibold">Aucune note pour le moment</p>
      </div>
    );
  }
  const max = Number(grade.max_score);
  const score = Number(grade.score);
  const on20 = grade.is_absent || !max ? null : (score / max) * 20;
  const type = grade.evaluations?.type;
  const date = grade.evaluations?.eval_date ?? (grade as { created_at?: string }).created_at ?? null;
  return (
    <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
          <PenLine className="h-3 w-3" />
          Dernière note
        </span>
        {date ? (
          <span className="text-xs font-semibold text-slate-500">
            {formatDateSafe(date, "d MMMM", { locale: fr })}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-slate-900">{grade.matieres?.name ?? "Matière"}</p>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            {[type ? evaluationTypeLabel(type) : null, grade.evaluations?.title].filter(Boolean).join(" · ")}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 text-3xl font-bold tabular-nums",
            on20 == null ? "text-slate-400" : on20 < 10 ? "text-rose-600" : "text-slate-900",
          )}
        >
          {grade.is_absent ? "Absent" : fmt(score)}
          {!grade.is_absent ? <span className="ml-0.5 text-sm font-semibold text-slate-400">/{fmt(max)}</span> : null}
        </p>
      </div>
    </div>
  );
}
