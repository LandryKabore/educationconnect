import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MessageSquare } from "lucide-react";
import { useAttendancePeriods } from "@/hooks/useAttendancePeriods";
import { useAttendanceOverview } from "@/hooks/useAttendanceOverview";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_TONE,
  absencesTotal,
  attendanceRate,
} from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Select } from "@/components/ui";

const STATUS_CHIPS = [
  { value: "", label: "Tout" },
  { value: "absent", label: "Absences" },
  { value: "late", label: "Retards" },
  { value: "excused", label: "Justifiées" },
] as const;

function RateRing({ rate }: { rate: number | null }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = rate ?? 0;
  const tone =
    rate === null
      ? "text-slate-300"
      : rate >= 90
        ? "text-emerald-600"
        : rate >= 80
          ? "text-amber-500"
          : "text-rose-600";
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-600" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          className={cn("stroke-current", tone)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-slate-900 dark:text-slate-100">
        {rate === null ? "—" : `${Math.round(rate)} %`}
      </span>
    </div>
  );
}

/**
 * Attendance of ONE student, for the student and for the parent:
 * period + subject filters, rate / absences / lateness cards, and only the exceptions.
 */
export function AttendanceOverview({
  keyRoot,
  studentId,
  enabled = true,
  audience,
}: {
  keyRoot: "mes-presences" | "enfant-presences";
  studentId: string | undefined;
  enabled?: boolean;
  audience: "parent" | "student";
}) {
  const periods = useAttendancePeriods();
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState<"" | "absent" | "late" | "excused">("");

  const period =
    periods.find((p) => p.key === periodKey) ??
    periods.find((p) => p.key === "trimester") ??
    periods[0];

  const ov = useAttendanceOverview(
    keyRoot,
    studentId,
    { from: period.from, to: period.to, subjectId, status },
    enabled,
  );
  const t = ov.totals;
  const rate = t ? attendanceRate(t) : null;
  const shownExceptions = ov.rows.length;
  const exceptionsTotal = t ? t.absent + t.late + t.excused : 0;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Période"
        className="grid rounded-2xl bg-slate-100 p-1 dark:bg-[var(--surface-2)]"
        style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}
      >
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === period.key}
            onClick={() => setPeriodKey(p.key)}
            className={cn(
              "whitespace-nowrap rounded-xl px-1 py-2 text-[13px] font-medium transition sm:px-2 sm:text-sm",
              p.key === period.key
                ? "bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {ov.subjects.length > 1 ? (
        <Select
          aria-label="Matière"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">Toutes les matières</option>
          {ov.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      ) : null}

      {ov.isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : ov.isError ? (
        <EmptyState message="Impossible de charger les présences. Réessayez plus tard." />
      ) : !t || t.total === 0 ? (
        <EmptyState message="Aucun cours enregistré sur cette période." />
      ) : (
        <>
          <Card className="flex items-center gap-4">
            <RateRing rate={rate} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Présence
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.total - t.absent} cours sur {t.total}
              </p>
              <p className="text-xs text-slate-500">
                Les absences justifiées ne comptent pas ; un retard compte comme présent.
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Absences
              </p>
              <p className="mt-1 text-2xl font-bold text-rose-600">{absencesTotal(t)}</p>
              <p className="text-xs text-slate-500">
                {t.excused} justifiée{t.excused !== 1 ? "s" : ""} · {t.absent} non justifiée
                {t.absent !== 1 ? "s" : ""}
              </p>
            </Card>
            <Card className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Retards
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{t.late}</p>
              <p className="text-xs text-slate-500">
                {t.present} cours présent{t.present !== 1 ? "s" : ""}
              </p>
            </Card>
          </div>

          <section aria-labelledby="exceptions-title">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2
                id="exceptions-title"
                className="text-sm font-semibold uppercase tracking-wide text-slate-500"
              >
                Absences et retards
              </h2>
              <span className="text-sm font-medium text-slate-500">{exceptionsTotal}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {STATUS_CHIPS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setStatus(c.value)}
                  aria-pressed={status === c.value}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition",
                    status === c.value
                      ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {ov.isListLoading ? (
              <p className="text-slate-500">Chargement…</p>
            ) : shownExceptions === 0 ? (
              <Card>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {exceptionsTotal === 0
                    ? "Aucune absence ni retard sur cette période. Bravo !"
                    : "Rien à afficher avec ce filtre."}
                </p>
              </Card>
            ) : (
              <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-700">
                {ov.rows.map((a) => {
                  const d = new Date(`${a.date}T00:00:00`);
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-11 shrink-0 text-center leading-tight">
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {format(d, "d")}
                        </p>
                        <p className="text-[11px] font-medium uppercase text-slate-500">
                          {format(d, "MMM", { locale: fr })}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {a.matieres?.name ?? "Matière"}
                        </p>
                        <p className="truncate text-xs capitalize text-slate-500">
                          {format(d, "EEEE", { locale: fr })}
                          {a.note ? ` · ${a.note}` : ""}
                        </p>
                      </div>
                      <Badge tone={ATTENDANCE_TONE[a.status]}>{ATTENDANCE_LABELS[a.status]}</Badge>
                    </div>
                  );
                })}
              </Card>
            )}

            {ov.hasNextPage ? (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ov.isFetchingNextPage}
                  onClick={ov.fetchNextPage}
                >
                  {ov.isFetchingNextPage
                    ? "Chargement…"
                    : `Afficher plus (${Math.max(exceptionsTotal - shownExceptions, 0)} restantes)`}
                </Button>
              </div>
            ) : null}
          </section>

          {t.absent > 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {audience === "parent"
                  ? "Une absence à justifier ? "
                  : "Une absence à expliquer ? "}
                <Link to="/messages" className="font-semibold underline">
                  Écrivez à l’école depuis la messagerie
                </Link>
                .
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
