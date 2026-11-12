import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronsUpDown, ListChecks, MessageSquare } from "lucide-react";
import { isNativeApp } from "@/lib/platform";
import { INK, IOS, MUTED, Capsule, IosEmpty } from "@/components/native/ios";
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
import { ScreenSkeleton } from "@/components/Skeleton";

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
  const native = isNativeApp();
  const tone =
    rate === null
      ? "text-slate-300"
      : rate >= 90
        ? native ? "text-[#4b8f4a]" : "text-emerald-600"
        : rate >= 80
          ? native ? "text-[#ff9500]" : "text-amber-500"
          : native ? "text-[#d4372e]" : "text-rose-600";
  return (
    <div className={cn("relative shrink-0", native ? "h-[72px] w-[72px]" : "h-20 w-20")}>
      <svg viewBox="0 0 72 72" className={cn("-rotate-90", native ? "h-[72px] w-[72px]" : "h-20 w-20")} aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-[#e2e8f0] dark:stroke-slate-600" />
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
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-100">
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

  if (isNativeApp()) {
    const STATUS_COLOR: Record<string, string> = {
      present: IOS.green,
      absent: IOS.red,
      late: IOS.orange,
      excused: IOS.teal,
    };
    return (
      <div className="space-y-4">
        <div role="tablist" aria-label="Période" className="ios-seg">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={p.key === period.key}
              onClick={() => setPeriodKey(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {ov.subjects.length > 1 ? (
          <label className="ios-field relative flex items-center justify-between !rounded-[14px] px-[14px] py-3">
            <span className={cn("text-[15px] font-medium", INK)}>
              {ov.subjects.find((x) => x.id === subjectId)?.name ?? "Toutes les matières"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[#64748b]" />
            <select
              aria-label="Matière"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="absolute inset-0 h-full w-full opacity-0"
            >
              <option value="">Toutes les matières</option>
              {ov.subjects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {ov.isLoading ? (
          <div className="space-y-3" aria-busy>
            <div className="ios-card h-[104px] animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="ios-card h-[88px] animate-pulse" />
              <div className="ios-card h-[88px] animate-pulse" />
            </div>
          </div>
        ) : ov.isError ? (
          <IosEmpty icon={<ListChecks strokeWidth={1.4} />} title="Chargement impossible" message="Impossible de charger les présences. Réessayez plus tard." />
        ) : !t || t.total === 0 ? (
          <IosEmpty icon={<ListChecks strokeWidth={1.4} />} title="Aucune présence" message="Aucun cours enregistré sur cette période." />
        ) : (
          <>
            <div className="ios-card flex items-center gap-4 p-4">
              <RateRing rate={rate} />
              <div className="min-w-0 space-y-1">
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", MUTED)}>Présence</p>
                <p className={cn("text-[17px] font-semibold", INK)}>
                  {t.total - t.absent} cours sur {t.total}
                </p>
                <p className={cn("text-xs", MUTED)}>
                  Les absences justifiées ne comptent pas ; un retard compte comme présent.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="ios-card space-y-1 p-[14px]">
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", MUTED)}>Absences</p>
                <p className="text-[22px] font-bold tabular-nums" style={{ color: IOS.red }}>
                  {absencesTotal(t)}
                </p>
                <p className={cn("text-xs", MUTED)}>
                  {t.excused} justifiée{t.excused !== 1 ? "s" : ""} · {t.absent} non justifiée
                  {t.absent !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="ios-card space-y-1 p-[14px]">
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", MUTED)}>Retards</p>
                <p className="text-[22px] font-bold tabular-nums" style={{ color: IOS.orange }}>
                  {t.late}
                </p>
                <p className={cn("text-xs", MUTED)}>
                  {t.present} cours présent{t.present !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <section aria-labelledby="exceptions-title" className="space-y-[10px]">
              <div className={cn("flex items-center justify-between text-xs font-bold uppercase tracking-[0.6px]", MUTED)}>
                <h2 id="exceptions-title">Absences et retards</h2>
                <span className="text-[15px] font-semibold normal-case tracking-normal">{exceptionsTotal}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_CHIPS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setStatus(c.value)}
                    aria-pressed={status === c.value}
                    className="ios-chip"
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {ov.isListLoading ? (
                <p className={cn("py-5 text-center text-sm", MUTED)}>Chargement…</p>
              ) : shownExceptions === 0 ? (
                <div className={cn("ios-card p-4 text-[15px]", MUTED)}>
                  {exceptionsTotal === 0
                    ? "Aucune absence ni retard sur cette période. Bravo !"
                    : "Rien à afficher avec ce filtre."}
                </div>
              ) : (
                <div className="ios-card overflow-hidden">
                  {ov.rows.map((a, i) => {
                    const d = new Date(`${a.date}T00:00:00`);
                    const color = STATUS_COLOR[a.status] ?? IOS.muted;
                    return (
                      <div key={a.id}>
                        {i > 0 ? <div className="ios-hairline ml-[68px]" /> : null}
                        <div className="flex items-center gap-3 px-[14px] py-3">
                          <div className="w-11 shrink-0 text-center">
                            <p className={cn("text-[20px] font-bold leading-tight tabular-nums", INK)}>{format(d, "d")}</p>
                            <p className={cn("text-[11px] font-semibold uppercase", MUTED)}>
                              {format(d, "MMM", { locale: fr })}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1 space-y-[3px]">
                            <p className={cn("truncate text-[15px] font-semibold", INK)}>{a.matieres?.name ?? "Matière"}</p>
                            <p className={cn("line-clamp-2 text-xs", MUTED)}>
                              <span className="capitalize">{format(d, "EEEE", { locale: fr })}</span>
                              {a.note ? ` · ${a.note}` : ""}
                            </p>
                          </div>
                          <Capsule color={color} className="!px-[10px] !py-[5px] !text-xs">
                            {ATTENDANCE_LABELS[a.status]}
                          </Capsule>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {ov.hasNextPage ? (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    disabled={ov.isFetchingNextPage}
                    onClick={ov.fetchNextPage}
                    className="ios-chip"
                  >
                    {ov.isFetchingNextPage
                      ? "Chargement…"
                      : `Afficher plus (${Math.max(exceptionsTotal - shownExceptions, 0)} restantes)`}
                  </button>
                </div>
              ) : null}
            </section>

            {t.absent > 0 ? (
              <div
                className="flex items-start gap-[10px] rounded-2xl p-[14px]"
                style={{ backgroundColor: "rgba(15,118,110,0.08)", border: "1px solid rgba(15,118,110,0.25)" }}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" style={{ color: IOS.teal }} fill="currentColor" />
                <div className="space-y-1">
                  <p className={cn("text-[15px] font-semibold", INK)}>
                    {audience === "parent" ? "Une absence à justifier ?" : "Une absence à expliquer ?"}
                  </p>
                  <Link to="/messages" className="text-[15px] font-semibold underline" style={{ color: IOS.teal }}>
                    Écrivez à l’école depuis la messagerie
                  </Link>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

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
        <ScreenSkeleton variant="cards" label="Chargement des présences…" />
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
