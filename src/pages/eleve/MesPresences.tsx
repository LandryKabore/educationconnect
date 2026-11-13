import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, max as maxDate, parseISO, startOfWeek, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarCheck2, Clock, FileCheck2, MessageSquare, UserX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { useAttendancePeriods } from "@/hooks/useAttendancePeriods";
import { useAttendanceOverview, type OverviewFilters } from "@/hooks/useAttendanceOverview";
import { attendanceRate } from "@/lib/attendance";
import { fetchAttendanceCounts } from "@/lib/scaleApi";
import { subjectSwatch } from "@/lib/subjectColors";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "En retard",
  excused: "Absence justifiée",
};

const STATUS_FILL: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  late: "bg-amber-400",
  excused: "bg-sky-500",
};

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  absent: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300",
  late: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  excused: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
};

const RANK: Record<AttendanceStatus, number> = { absent: 3, late: 2, excused: 1, present: 0 };
const MAX_CALENDAR_WEEKS = 14;

function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MesPresences() {
  const { user } = useAuth();
  const { markSeen } = usePresencePendingChanges();
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const periods = useAttendancePeriods();
  const [periodKey, setPeriodKey] = useState<string>("trimester");
  const period = periods.find((p) => p.key === periodKey) ?? periods.find((p) => p.key === "trimester") ?? periods[0];
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState<OverviewFilters["status"]>("");

  const overview = useAttendanceOverview("mes-presences", user?.id, {
    from: period?.from ?? null,
    to: period?.to ?? null,
    subjectId,
    status,
  });
  const totals = overview.totals;
  const rate = totals ? attendanceRate(totals) : null;

  // per subject, whole history (exact, computed in SQL)
  const { data: bySubject = [] } = useQuery({
    queryKey: ["mes-presences", user?.id, "by-subject"],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const c = await fetchAttendanceCounts(user!.id);
      return (c.bySubject ?? [])
        .map((s) => {
          const total = s.present + s.absent + s.late + s.excused;
          return { id: s.subjectId ?? s.name, name: s.name, total, absent: s.absent, late: s.late, excused: s.excused };
        })
        .filter((s) => s.total > 0)
        .sort((a, b) => b.absent - a.absent || b.late - a.late || a.name.localeCompare(b.name, "fr"));
    },
  });

  // calendar: the last weeks of the chosen period, one cell per school day (worst status of the day)
  const calendarRange = useMemo(() => {
    const today = new Date();
    const end = period?.to && parseISO(period.to) < today ? parseISO(period.to) : today;
    const earliest = startOfWeek(subWeeks(end, MAX_CALENDAR_WEEKS - 1), { weekStartsOn: 1 });
    const start = period?.from ? maxDate([startOfWeek(parseISO(period.from), { weekStartsOn: 1 }), earliest]) : earliest;
    return { from: iso(start), to: iso(end) };
  }, [period?.from, period?.to]);

  const { data: dayStatus = {} } = useQuery({
    queryKey: ["mes-presences", user?.id, "calendar", calendarRange.from, calendarRange.to, subjectId],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("presences")
        .select("date, status")
        .eq("student_id", user!.id)
        .gte("date", calendarRange.from)
        .lte("date", calendarRange.to)
        .limit(2000);
      if (subjectId) q = q.eq("subject_id", subjectId);
      const { data, error } = await q;
      if (error) throw error;
      const out: Record<string, AttendanceStatus> = {};
      for (const r of (data ?? []) as { date: string; status: AttendanceStatus }[]) {
        const cur = out[r.date];
        if (!cur || RANK[r.status] > RANK[cur]) out[r.date] = r.status;
      }
      return out;
    },
  });

  const weeks = useMemo(() => {
    const start = parseISO(calendarRange.from);
    const end = parseISO(calendarRange.to);
    const list: string[][] = [];
    for (let w = startOfWeek(start, { weekStartsOn: 1 }); w <= end; w = addDays(w, 7)) {
      list.push([0, 1, 2, 3, 4, 5].map((d) => iso(addDays(w, d))));
    }
    return list;
  }, [calendarRange]);

  const byMonth = useMemo(() => {
    const g = new Map<string, typeof overview.rows>();
    for (const r of overview.rows) {
      const key = r.date.slice(0, 7);
      g.set(key, [...(g.get(key) ?? []), r]);
    }
    return [...g.entries()];
  }, [overview.rows]);

  const todayIso = iso(new Date());

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">Mes présences</h1>
          <p className="mt-1 text-sm text-slate-500">
            Un retard compte comme présent ; une absence justifiée ne compte pas contre toi.
          </p>
        </div>
        <div className="inline-flex self-start rounded-md bg-slate-100 p-1 md:self-auto dark:bg-[var(--surface-2)]">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={p.key === period?.key}
              onClick={() => setPeriodKey(p.key)}
              className={cn(
                "rounded px-3.5 py-1.5 text-sm font-semibold transition",
                p.key === period?.key
                  ? "bg-white text-slate-900 shadow-sm dark:bg-[var(--surface)]"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {overview.subjects.length > 1 ? (
        <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1">
          <Chip on={!subjectId} onClick={() => setSubjectId("")}>
            Toutes les matières
          </Chip>
          {overview.subjects.map((s) => (
            <Chip key={s.id} on={subjectId === s.id} onClick={() => setSubjectId(subjectId === s.id ? "" : s.id)}>
              <span className={cn("h-2 w-2 rounded-full", subjectSwatch(s.name).dot)} />
              {s.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {overview.isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Chargement">
          <div className="grid gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : !totals || totals.total === 0 ? (
        <EmptyState message="Aucun appel enregistré pour cette période." />
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-navy-800 via-navy-700 to-brand-700 p-5 text-white shadow-lg shadow-navy-800/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Présence · {period?.label}</p>
              <p className="mt-2 text-5xl font-bold tabular-nums">
                {rate != null ? String(Math.round(rate)) : "—"}
                <span className="ml-0.5 text-2xl font-semibold text-white/70">%</span>
              </p>
              <p className="mt-2 text-sm text-white/80">
                {totals.total - totals.absent} cours sur {totals.total}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-white/15">
                <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${rate ?? 0}%` }} />
              </div>
            </div>
            <Counter
              icon={UserX}
              label="Absences non justifiées"
              value={totals.absent}
              on={status === "absent"}
              onClick={() => setStatus(status === "absent" ? "" : "absent")}
            />
            <Counter
              icon={Clock}
              label="Retards"
              value={totals.late}
              on={status === "late"}
              onClick={() => setStatus(status === "late" ? "" : "late")}
            />
            <Counter
              icon={FileCheck2}
              label="Absences justifiées"
              value={totals.excused}
              on={status === "excused"}
              onClick={() => setStatus(status === "excused" ? "" : "excused")}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              {/* Calendar */}
              <section className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm lg:p-6 dark:border-white/10">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-900">Calendrier</h2>
                  <p className="text-xs text-slate-500">
                    {weeks.length} semaine{weeks.length > 1 ? "s" : ""} · une case par jour de classe
                  </p>
                </div>
                <div className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-1.5 text-center">
                  <span />
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d) => (
                    <span key={d} className="pb-1 text-[11px] font-semibold uppercase text-slate-500">
                      {d}
                    </span>
                  ))}
                  {weeks.map((week) => (
                    <WeekRow key={week[0]} week={week} dayStatus={dayStatus} today={todayIso} />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                  {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <span className={cn("h-3 w-3 rounded-sm", STATUS_FILL[s])} />
                      {STATUS_LABEL[s]}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-slate-100 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10" />
                    Pas de cours
                  </span>
                </div>
              </section>

              {/* Exceptions */}
              <section className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm lg:p-6 dark:border-white/10">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    {status === "absent"
                      ? "Absences non justifiées"
                      : status === "late"
                        ? "Retards"
                        : status === "excused"
                          ? "Absences justifiées"
                          : "Absences et retards"}
                  </h2>
                  {status ? (
                    <button
                      type="button"
                      onClick={() => setStatus("")}
                      className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                    >
                      Tout afficher
                    </button>
                  ) : null}
                </div>
                {overview.isListLoading ? (
                  <div className="h-24 animate-pulse rounded-md bg-slate-100" />
                ) : overview.rows.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CalendarCheck2 className="h-5 w-5 shrink-0" />
                    Aucune absence ni retard sur cette période. Bravo !
                  </div>
                ) : (
                  <div className="space-y-5">
                    {byMonth.map(([month, rows]) => (
                      <div key={month}>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          {capitalize(format(parseISO(`${month}-01`), "MMMM yyyy", { locale: fr }))}
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-100 dark:divide-white/5 dark:ring-white/5">
                          {rows.map((r) => (
                            <li key={r.id} className="flex items-center gap-4 px-3 py-3">
                              <div className="w-12 shrink-0 text-center">
                                <p className="text-lg font-bold leading-none tabular-nums text-slate-900">
                                  {format(parseISO(r.date), "d")}
                                </p>
                                <p className="text-[10px] font-semibold uppercase text-slate-500">
                                  {format(parseISO(r.date), "EEE", { locale: fr }).replace(".", "")}
                                </p>
                              </div>
                              <span className={cn("h-8 w-1 shrink-0 rounded-sm", subjectSwatch(r.matieres?.name).dot)} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {r.matieres?.name ?? "Cours"}
                                </p>
                                {r.note ? <p className="truncate text-xs text-slate-500">{r.note}</p> : null}
                              </div>
                              <span className={cn("shrink-0 rounded-md px-2.5 py-1 text-xs font-bold", STATUS_BADGE[r.status])}>
                                {STATUS_LABEL[r.status]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {overview.hasNextPage ? (
                      <button
                        type="button"
                        onClick={overview.fetchNextPage}
                        disabled={overview.isFetchingNextPage}
                        className="w-full rounded-md border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-200"
                      >
                        {overview.isFetchingNextPage ? "Chargement…" : "Afficher plus"}
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-6 lg:col-span-4">
              <section className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm lg:p-6 dark:border-white/10">
                <h2 className="text-lg font-bold text-slate-900">Par matière</h2>
                <p className="mb-4 text-xs text-slate-500">Depuis le début de l’année · rouge = absent, jaune = retard</p>
                <ul className="space-y-3">
                  {bySubject.map((s) => {
                    const subjRate = Math.round(((s.total - s.absent) / s.total) * 100);
                    return (
                      <li key={s.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-800">
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", subjectSwatch(s.name).dot)} />
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {s.absent > 0 ? `${s.absent} absence${s.absent > 1 ? "s" : ""}` : ""}
                            {s.absent > 0 && s.late > 0 ? " · " : ""}
                            {s.late > 0 ? `${s.late} retard${s.late > 1 ? "s" : ""}` : ""}
                            <span className="ml-2 font-bold tabular-nums text-slate-900">{subjRate} %</span>
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-sm bg-emerald-500">
                          <span className="bg-rose-500" style={{ width: `${(s.absent / s.total) * 100}%` }} />
                          <span className="bg-amber-400" style={{ width: `${(s.late / s.total) * 100}%` }} />
                          <span className="bg-sky-500" style={{ width: `${(s.excused / s.total) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-lg border border-slate-200/80 bg-slate-50 p-5 dark:border-white/10">
                <p className="font-semibold text-slate-900">Une absence à expliquer ?</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Écris à l’école : seule l’administration peut justifier une absence.
                </p>
                <Link
                  to="/messages"
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  Écrire à l’école
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold ring-1 transition",
        on
          ? "bg-navy-800 text-white ring-navy-800 dark:bg-brand-600 dark:ring-brand-600"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:ring-white/10 dark:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function Counter({
  icon: Icon,
  label,
  value,
  on,
  onClick,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex flex-col justify-between rounded-lg border bg-white p-5 text-left shadow-sm transition",
        on
          ? "border-brand-300 ring-2 ring-brand-100 dark:border-brand-500/50 dark:ring-brand-500/20"
          : "border-slate-200/80 hover:border-slate-300 dark:border-white/10",
      )}
    >
      <span className="flex text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-3">
        <span className="block text-3xl font-bold tabular-nums text-slate-900">{value}</span>
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
      </span>
    </button>
  );
}

function WeekRow({
  week,
  dayStatus,
  today,
}: {
  week: string[];
  dayStatus: Record<string, AttendanceStatus>;
  today: string;
}) {
  return (
    <>
      <span className="pr-2 text-right text-[11px] font-medium leading-8 text-slate-400">
        {format(parseISO(week[0]), "d MMM", { locale: fr }).replace(".", "")}
      </span>
      {week.map((day) => {
        const s = dayStatus[day];
        const future = day > today;
        return (
          <span
            key={day}
            title={`${capitalize(format(parseISO(day), "EEEE d MMMM", { locale: fr }))} : ${s ? STATUS_LABEL[s] : future ? "à venir" : "pas de cours"}`}
            className={cn(
              "flex h-8 items-center justify-center rounded-sm text-[11px] font-bold tabular-nums",
              s
                ? cn(STATUS_FILL[s], "text-white")
                : cn(
                    "bg-slate-100 text-slate-400 dark:bg-white/5",
                    future && "bg-transparent ring-1 ring-slate-200 dark:ring-white/10",
                  ),
              day === today && "ring-2 ring-navy-800 ring-offset-1 dark:ring-white",
            )}
          >
            {format(parseISO(day), "d")}
          </span>
        );
      })}
    </>
  );
}
