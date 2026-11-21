import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { fetchAnnualAverage } from "@/lib/annualAverage";
import { ANNUAL_PERIOD_LABEL } from "@/lib/averages";
import { fetchBulletinStats } from "@/lib/bulletinData";
import { bulletinMention, conseilSentence, fmtFr, ordinalText } from "@/lib/bulletinFormat";
import { cn } from "@/lib/utils";

type Props = {
  studentId: string | undefined;
  classSectionId: string | undefined;
  period: string;
  closedLabels: ReadonlySet<string>;
  className: string | undefined;
  title: string;
  subtitle: string;
};

/** Teal banner of the bulletin pages (student and parent): average, rank, class average, council card. */
export function BulletinBanner({ studentId, classSectionId, period, closedLabels, className, title, subtitle }: Props) {
  const isAnnual = period === ANNUAL_PERIOD_LABEL;

  // same query key as BulletinView below: one request feeds both
  const { data: view } = useQuery({
    queryKey: ["bulletin-view", studentId, classSectionId, period],
    enabled: !!studentId && !!classSectionId,
    queryFn: async () => {
      const stats = await fetchBulletinStats(studentId!, classSectionId!, period);
      const annual = isAnnual ? await fetchAnnualAverage(studentId!, classSectionId!) : null;
      return { stats, annual };
    },
  });
  const general = view?.stats?.general ?? null;
  const avg = general?.student_avg ?? view?.annual?.annualAverage ?? null;
  const closed = closedLabels.has(period);

  // same teal gradient and effects as the home banner
  return (
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                Bulletin scolaire{className ? ` · Classe ${className}` : ""}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">{title}</h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                {subtitle}
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
