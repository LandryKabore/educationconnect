import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { buildBulletinPdf, fetchBulletinStats } from "@/lib/bulletinData";
import { fetchAnnualAverage } from "@/lib/annualAverage";
import { bulletinMention, conseilSentence, fmtFr, ordinalText } from "@/lib/bulletinFormat";
import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { useGradingPeriodState } from "@/hooks/useGradingPeriodState";
import type { Profile, School } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { EmptyState, PageLoadingState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BulletinView } from "@/components/BulletinView";

const BULLETIN_PERIODS = [...TRIMESTER_PERIODS, ANNUAL_PERIOD_LABEL] as const;

export default function MonBulletin() {
  const { user, profile, schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);

  const { data: enrollment, isLoading } = useQuery({
    queryKey: ["mon-inscription-bulletin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as {
        class_section_id: string;
        classes: { name: string } | null;
      } | null;
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["mes-periodes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("period_label")
        .eq("student_id", user!.id);
      const set = new Set(
        (data ?? []).map((r) => r.period_label as string).filter(Boolean),
      );
      for (const d of TRIMESTER_PERIODS) set.add(d);
      set.add(ANNUAL_PERIOD_LABEL);
      return [
        ...TRIMESTER_PERIODS.filter((p) => set.has(p)),
        ANNUAL_PERIOD_LABEL,
        ...[...set].filter(
          (p) =>
            !(TRIMESTER_PERIODS as readonly string[]).includes(p) &&
            p !== ANNUAL_PERIOD_LABEL,
        ),
      ];
    },
  });

  const periodLabels = periods.length > 0 ? periods : BULLETIN_PERIODS;
  const { period, selectPeriod, closedLabels } = useGradingPeriodState(
    periodLabels,
    { classSectionId: enrollment?.class_section_id, schoolId },
  );

  /** Official PDF (registers the QR code) — only on download / share. */
  const buildPdf = async () => {
    if (!user || !profile || !school || !enrollment?.class_section_id) {
      throw new Error("Profil, classe ou école introuvable");
    }
    const coefficientBySubject: Record<string, number> = {};
    const { data: programme } = await supabase
      .from("programme_classe")
      .select("subject_id, coefficient")
      .eq("class_section_id", enrollment.class_section_id);
    for (const row of programme ?? []) {
      coefficientBySubject[row.subject_id as string] = Number(row.coefficient);
    }
    return buildBulletinPdf({
      school: school as School,
      student: profile as Profile,
      classSectionId: enrollment.class_section_id,
      className: enrollment.classes?.name ?? "—",
      periodLabel: period,
      coefficientBySubject,
    });
  };

  const filePeriod =
    period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");
  const isAnnual = period === ANNUAL_PERIOD_LABEL;

  // same query key as BulletinView below: one request feeds both
  const { data: view } = useQuery({
    queryKey: ["bulletin-view", user?.id, enrollment?.class_section_id, period],
    enabled: !!user?.id && !!enrollment?.class_section_id,
    queryFn: async () => {
      const stats = await fetchBulletinStats(user!.id, enrollment!.class_section_id, period);
      const annual = isAnnual ? await fetchAnnualAverage(user!.id, enrollment!.class_section_id) : null;
      return { stats, annual };
    },
  });
  const general = view?.stats?.general ?? null;
  const avg = general?.student_avg ?? view?.annual?.annualAverage ?? null;
  const closed = closedLabels.has(period);

  return (
    // squarer corners on this page only: the shared bulletin keeps its radius elsewhere
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Banner: same teal gradient and effects as the home banner */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                Bulletin scolaire{enrollment?.classes?.name ? ` · Classe ${enrollment.classes.name}` : ""}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">Mon bulletin</h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                Tes moyennes, ton rang et le bulletin officiel en PDF.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat
                label={isAnnual ? "Moyenne annuelle" : period}
                value={avg != null ? fmtFr(avg) : "—"}
                hint={avg != null ? bulletinMention(avg) : "Pas encore de note"}
              />
              <BannerStat
                label="Rang"
                value={general?.rank ? ordinalText(general.rank) : "—"}
                hint={general?.rank ? `sur ${general.ranked_count} élèves` : "pas encore classé"}
              />
              <BannerStat
                label="Moyenne de la classe"
                value={general?.class_avg != null ? fmtFr(general.class_avg) : "—"}
                hint={
                  avg != null && general?.class_avg != null
                    ? avg >= general.class_avg
                      ? "tu es au-dessus"
                      : "tu es en dessous"
                    : "—"
                }
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
                  <FileText className="h-3 w-3" />
                  Conseil de classe
                </span>
                <span className={cn("text-xs font-bold", closed ? "text-slate-500" : "text-emerald-700")}>
                  {closed ? "Période clôturée" : "Provisoire"}
                </span>
              </div>
              <p className="mt-3 text-xl font-bold text-slate-900">
                {isAnnual ? "Bilan de l’année" : `Bilan du ${period}`}
              </p>
              <p className="mt-1 line-clamp-3 text-sm text-slate-500">
                {view
                  ? conseilSentence({
                      average: avg,
                      subjects: view.stats?.subjects ?? [],
                      isAnnual,
                      annual: view.annual ?? null,
                    })
                  : "Chargement…"}
              </p>
              {view?.stats ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
                  {view.stats.attendance.absences} absence{view.stats.attendance.absences > 1 ? "s" : ""} ·{" "}
                  {view.stats.attendance.lates} retard{view.stats.attendance.lates > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      {isLoading ? (
        <PageLoadingState message="Chargement du bulletin…" />
      ) : !enrollment ? (
        <EmptyState message="Vous n’êtes pas encore inscrit dans une classe." />
      ) : (
        <div className="max-w-2xl">
          <BulletinView
            studentId={user!.id}
            classSectionId={enrollment.class_section_id}
            periods={periodLabels}
            period={period}
            onPeriodChange={selectPeriod}
            closedPeriods={closedLabels}
            buildPdf={buildPdf}
            fileName={`bulletin-${profile?.last_name ?? "eleve"}-${filePeriod}.pdf`}
          />
        </div>
      )}
    </div>
  );
}

function BannerStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md bg-white/10 p-3.5 ring-1 ring-white/15">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums lg:text-[1.75rem]">{value}</p>
      <p className="mt-0.5 truncate text-xs text-white/80">{hint}</p>
    </div>
  );
}
