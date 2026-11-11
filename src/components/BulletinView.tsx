import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, LoaderCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import type jsPDF from "jspdf";
import { ANNUAL_PERIOD_LABEL, PASSING_AVERAGE } from "@/lib/averages";
import { fetchAnnualAverage } from "@/lib/annualAverage";
import { fetchBulletinStats } from "@/lib/bulletinData";
import {
  absencesText,
  bulletinMention,
  conseilSentence,
  fmtFr,
  latesText,
  ordinalText,
  periodTabLabel,
  subjectAppreciation,
} from "@/lib/bulletinFormat";
import type { BulletinClassStats } from "@/lib/pdfBulletin";
import type { AnnualAverageResult } from "@/lib/averages";
import { periodOptionLabel } from "@/lib/gradingPeriod";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState } from "@/components/ui";

type Annual = Pick<AnnualAverageResult, "annualAverage" | "passed" | "complete" | "trimesters">;

function appreciationTone(avg: number) {
  if (avg >= 14) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-50";
  if (avg >= 12) return "bg-sky-100 text-sky-900 dark:bg-sky-800 dark:text-sky-50";
  if (avg >= 10) return "bg-slate-100 text-slate-800 dark:bg-slate-600 dark:text-slate-50";
  return "bg-amber-100 text-amber-950 dark:bg-amber-700 dark:text-amber-50";
}

export type BulletinViewBodyProps = {
  periods: readonly string[];
  period: string;
  onPeriodChange: (p: string) => void;
  /** Periods closed by the school (shown as « (clôturé) », still selectable). */
  closedPeriods?: ReadonlySet<string>;
  stats: BulletinClassStats | null | undefined;
  annual?: Annual | null;
  loading?: boolean;
  error?: string | null;
  onDownload: () => void;
  onShare?: (() => void) | null;
  busy?: "download" | "share" | null;
  /** Hide the sticky action bar (e.g. when the page already has one). */
  stickyActions?: boolean;
};

/** Presentational bulletin (no data fetching). */
export function BulletinViewBody({
  periods,
  period,
  onPeriodChange,
  closedPeriods,
  stats,
  annual,
  loading,
  error,
  onDownload,
  onShare,
  busy,
  stickyActions = true,
}: BulletinViewBodyProps) {
  const isAnnual = period === ANNUAL_PERIOD_LABEL || !!stats?.is_annual;
  const general = stats?.general ?? null;
  const avg = general?.student_avg ?? annual?.annualAverage ?? null;
  const subjects = stats?.subjects ?? [];
  const hasData = subjects.length > 0 || avg !== null;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? subjects : subjects.slice(0, 6);
  const nAbs = stats?.attendance.absences ?? 0;
  const nLate = stats?.attendance.lates ?? 0;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Période"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-brand-200 bg-brand-50/60 p-1 dark:border-[var(--border)]"
      >
        {periods.map((p) => {
          const active = p === period;
          const closed = closedPeriods?.has(p) ?? false;
          return (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={active}
              title={periodOptionLabel(p, closed)}
              onClick={() => {
                setShowAll(false);
                onPeriodChange(p);
              }}
              className={cn(
                "min-w-16 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition",
                active
                  ? "bg-brand-700 text-white shadow-sm"
                  : "text-brand-900 hover:bg-white dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
              )}
            >
              {periodTabLabel(p)}
              {closed ? (
                <span className="ml-1 text-xs font-medium opacity-75">(clôturé)</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div aria-busy="true" className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl border-2 border-brand-100 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]" />
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-[var(--surface-2)]" />
            ))}
          </div>
          <p className="sr-only" role="status">
            Chargement du bulletin…
          </p>
        </div>
      ) : error ? (
        <EmptyState message={error} />
      ) : !hasData ? (
        <EmptyState
          message={
            isAnnual
              ? "Aucune note sur l’année pour le moment."
              : `Aucune note pour le ${period.toLowerCase()} pour le moment.`
          }
        />
      ) : (
        <>
          <section
            aria-label={isAnnual ? "Moyenne annuelle" : "Moyenne générale"}
            className="rounded-2xl border-2 border-brand-700 bg-white p-4 dark:bg-[var(--surface)]"
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-800 dark:text-brand-300">
                  {isAnnual ? "Moyenne annuelle" : "Moyenne générale"}
                </p>
                <p className="mt-1 leading-none text-slate-900 dark:text-slate-50">
                  <span className="text-4xl font-extrabold tracking-tight">{fmtFr(avg)}</span>
                  <span className="ml-1 text-sm font-semibold text-slate-600 dark:text-slate-300">/20</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Mention
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {bulletinMention(avg)}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-brand-50 px-1.5 py-2 dark:bg-[var(--surface-2)]">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Rang</dt>
                <dd className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  {general?.rank ? `${ordinalText(general.rank)} / ${general.ranked_count}` : "—"}
                </dd>
              </div>
              <div className="rounded-xl bg-brand-50 px-1.5 py-2 dark:bg-[var(--surface-2)]">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Moy. classe</dt>
                <dd className="text-sm font-bold text-slate-900 dark:text-slate-50">{fmtFr(general?.class_avg)}</dd>
              </div>
              <div className="rounded-xl bg-brand-50 px-1.5 py-2 dark:bg-[var(--surface-2)]">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Assiduité</dt>
                <dd
                  className="whitespace-nowrap text-[13px] font-bold text-slate-900 dark:text-slate-50"
                  title={`${absencesText(nAbs)} · ${latesText(nLate)}`}
                >
                  {nAbs} abs. · {nLate} ret.
                </dd>
              </div>
            </dl>
            {isAnnual && annual && annual.trimesters.length > 0 ? (
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                {annual.trimesters
                  .map((t) => `${periodTabLabel(t.periodLabel)} : ${fmtFr(t.generalAverage)}`)
                  .join(" · ")}
              </p>
            ) : null}
          </section>

          {subjects.length > 0 ? (
            <section aria-labelledby="bulletin-matieres">
              <h2
                id="bulletin-matieres"
                className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
              >
                Matières
              </h2>
              <Card className="divide-y divide-slate-100 p-0 dark:divide-[var(--border)]">
                {visible.map((s) => {
                  const below = s.student_avg < s.class_avg;
                  return (
                    <div key={s.subject_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{s.subject_name}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Coef. {String(s.coefficient).replace(".", ",")}
                          {s.rank ? ` · ${ordinalText(s.rank)}/${s.ranked_count}` : ""}
                          {s.teacher_name ? ` · ${s.teacher_name}` : ""}
                          {below ? " · sous la moy. de classe" : ""}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "text-base tabular-nums text-slate-900 dark:text-slate-50",
                          s.student_avg < PASSING_AVERAGE ? "font-extrabold underline decoration-2 underline-offset-2" : "font-bold",
                        )}
                      >
                        {fmtFr(s.student_avg)}
                      </p>
                      <span
                        className={cn(
                          "w-[5.5rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold",
                          appreciationTone(s.student_avg),
                        )}
                      >
                        {subjectAppreciation(s.student_avg)}
                      </span>
                    </div>
                  );
                })}
                {subjects.length > 6 ? (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="w-full px-4 py-3 text-center text-sm font-medium text-brand-800 hover:bg-slate-50 dark:text-brand-300 dark:hover:bg-[var(--surface-2)]"
                  >
                    {showAll
                      ? "Afficher moins"
                      : `+ ${subjects.length - 6} autre${subjects.length - 6 > 1 ? "s" : ""} matière${subjects.length - 6 > 1 ? "s" : ""}`}
                  </button>
                ) : null}
              </Card>
            </section>
          ) : null}

          <Card className="p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Conseil de classe
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
              {conseilSentence({ average: avg, subjects, isAnnual, annual: annual ?? null })}
            </p>
          </Card>
        </>
      )}

      <div
        className={cn(
          "flex gap-2",
          stickyActions &&
            "sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border dark:border-[var(--border)] dark:bg-[var(--surface)]/95",
        )}
      >
        <Button
          className="flex-1"
          onClick={onDownload}
          disabled={!!busy || loading || !hasData}
        >
          {busy === "download" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {busy === "download" ? "Génération…" : "Télécharger le PDF"}
        </Button>
        {onShare ? (
          <Button
            variant="outline"
            className="flex-1"
            onClick={onShare}
            disabled={!!busy || loading || !hasData}
          >
            {busy === "share" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            Partager
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare) return false;
    const probe = new File([new Uint8Array([37])], "x.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export type BulletinViewProps = {
  studentId: string;
  classSectionId: string;
  periods: readonly string[];
  period: string;
  onPeriodChange: (p: string) => void;
  /** Periods closed by the school (shown as « (clôturé) », still selectable). */
  closedPeriods?: ReadonlySet<string>;
  /** Builds the official PDF (registers its QR code). Only called on download / share. */
  buildPdf: () => Promise<jsPDF>;
  fileName: string;
  stickyActions?: boolean;
};

/**
 * On-screen bulletin shared by the student, the parent and the admin preview.
 * Reads `ef_bulletin_class_stats` only; it never issues a QR code — the PDF does, on demand.
 */
export function BulletinView({
  studentId,
  classSectionId,
  periods,
  period,
  onPeriodChange,
  closedPeriods,
  buildPdf,
  fileName,
  stickyActions,
}: BulletinViewProps) {
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const isAnnual = period === ANNUAL_PERIOD_LABEL;

  const { data, isLoading, error } = useQuery({
    queryKey: ["bulletin-view", studentId, classSectionId, period],
    enabled: !!studentId && !!classSectionId,
    queryFn: async () => {
      const stats = await fetchBulletinStats(studentId, classSectionId, period);
      const annual = isAnnual ? await fetchAnnualAverage(studentId, classSectionId) : null;
      return { stats, annual };
    },
  });

  const run = async (kind: "download" | "share") => {
    setBusy(kind);
    try {
      const doc = await buildPdf();
      if (kind === "share") {
        const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
        try {
          await navigator.share({ files: [file], title: fileName });
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") throw e;
        }
      } else {
        doc.save(fileName);
        toast.success("Bulletin téléchargé");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setBusy(null);
    }
  };

  return (
    <BulletinViewBody
      periods={periods}
      period={period}
      onPeriodChange={onPeriodChange}
      closedPeriods={closedPeriods}
      stats={data?.stats}
      annual={data?.annual}
      loading={isLoading}
      error={error ? "Impossible de charger le bulletin pour le moment." : null}
      onDownload={() => void run("download")}
      onShare={canShareFiles() ? () => void run("share") : null}
      busy={busy}
      stickyActions={stickyActions}
    />
  );
}
