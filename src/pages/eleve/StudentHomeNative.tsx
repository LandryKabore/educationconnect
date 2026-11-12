import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { fr } from "date-fns/locale";
import {
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Mail,
  Megaphone,
  MessageSquare,
  PencilLine,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HomeworkTomorrowCard } from "@/components/HomeworkTomorrowCard";
import { formatDateSafe } from "@/lib/dateFr";
import { getTimeGreeting } from "@/lib/greeting";
import { formatAverage, formatPassDecision, type AnnualAverageResult } from "@/lib/averages";
import { subjectSwatch } from "@/lib/subjectColors";
import { formatRoomLabel } from "@/lib/timetableLayout";
import { cn } from "@/lib/utils";
import type { UnreadInboxCounts } from "@/hooks/useUnreadMessagesCount";

/** « 9h » / « 9h30 » — same short clock as the iOS app. */
function shortClock(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":").map((x) => Number(x));
  if (Number.isNaN(h)) return "";
  return !m ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export type HomeSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  teacherName: string | null;
  matieres: { name: string } | null;
};

export type StudentHomeNativeProps = {
  userId: string | undefined;
  firstName: string;
  classLabel: string;
  todayCaption: string;
  unread: UnreadInboxCounts;
  edtPendingCount: number;
  edtPendingLabel: string | null;
  onEdtSeen: () => void;
  /** Today's lessons, sorted. */
  todaySlots: HomeSlot[];
  focus: { slot: HomeSlot; kind: "current" | "next"; dayLabel: string; isLaterDay: boolean } | null;
  nowMinutes: number;
  annual: AnnualAverageResult | undefined;
  attendanceRate: number | null;
  absencesCount: number;
  lateCount: number;
  notesCount: number;
  pendingExercices: { id: string; title: string; due_date: string | null; matieres: { name: string } | null }[];
  upcomingExamens: { id: string; title: string; due_date: string | null; matieres: { name: string } | null }[];
  upcomingCompositions: { id: string; title: string; period_label: string; starts_on: string }[];
  recentNotes: {
    id: string;
    score: number | null;
    max_score: number | null;
    is_absent: boolean;
    period_label: string;
    evalTitle: string | null;
    matieres: { name: string } | null;
  }[];
  timeToMinutes: (t: string) => number;
};

const card =
  "rounded-2xl border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]";
const inner = "rounded-xl bg-slate-50 dark:bg-[var(--surface-2)]";

function NPanel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(card, "p-4")}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function averageTone(value: number | null | undefined) {
  if (value == null) return "text-slate-500 dark:text-slate-300";
  return value >= 10 ? "text-brand-700 dark:text-brand-300" : "text-amber-600 dark:text-amber-400";
}

function StatTile({
  to,
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  to: string;
  label: string;
  value: string;
  hint: string;
  tone: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className={cn(card, "flex min-h-[7.25rem] min-w-0 flex-col gap-1.5 p-3 active:bg-slate-50 dark:active:bg-[var(--surface-2)]")}
    >
      <Icon className={cn("h-4 w-4", tone)} aria-hidden />
      <span className={cn("truncate text-2xl font-bold tabular-nums", tone)}>{value}</span>
      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{label}</span>
      <span className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">{hint}</span>
    </Link>
  );
}

function AvgChip({ label, value, footer, highlight }: { label: string; value: number | null; footer: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl px-1 py-2.5 text-center",
        highlight
          ? "bg-brand-50 ring-1 ring-brand-100 dark:bg-brand-950/40 dark:ring-brand-800"
          : "bg-slate-50 dark:bg-[var(--surface-2)]",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wide",
          highlight ? "text-brand-700 dark:text-brand-300" : "text-slate-600 dark:text-slate-300",
        )}
      >
        {label}
      </p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", averageTone(value))}>{formatAverage(value, 1)}</p>
      <p className="truncate px-0.5 text-[11px] text-slate-600 dark:text-slate-300">{footer}</p>
    </div>
  );
}

const SHORTCUTS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/mes-notes", label: "Mes notes", icon: BookOpen },
  { to: "/mes-presences", label: "Présences", icon: CheckCircle2 },
  { to: "/mes-exercices", label: "Exercices", icon: ClipboardList },
  { to: "/mes-devoirs", label: "Devoirs", icon: FileText },
  { to: "/mes-compositions", label: "Compositions", icon: BookMarked },
  { to: "/mon-bulletin", label: "Bulletin", icon: GraduationCap },
  { to: "/mon-emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
  { to: "/mes-profs", label: "Mes profs", icon: Users },
  { to: "/mon-cahier", label: "Cahier", icon: PencilLine },
  { to: "/messages", label: "Messages", icon: MessageSquare },
];

/**
 * Android app — student home, same blocks and order as the native iOS StudentHomeView:
 * hero, inbox, today, stats, bulletin averages, to prepare, latest grades, shortcuts.
 */
export function StudentHomeNative(p: StudentHomeNativeProps) {
  const annualAvg = p.annual?.annualAverage ?? null;
  const trimesters = p.annual?.trimesters ?? [];
  const laterToday = p.focus && !p.focus.isLaterDay
    ? p.todaySlots.filter(
        (s) => s.id !== p.focus!.slot.id && p.timeToMinutes(s.start_time) > p.timeToMinutes(p.focus!.slot.start_time),
      )
    : [];
  const todaySubtitle = (() => {
    if (p.todaySlots.length === 0 && !p.focus) return "Aucun cours au planning";
    if (!p.focus) return `${p.todaySlots.length} cours · terminée`;
    if (p.focus.isLaterDay) return `Prochain · ${p.focus.dayLabel}`;
    if (p.focus.kind === "current") return `En cours · ${laterToday.length} après`;
    return `Prochain · ${laterToday.length} ensuite`;
  })();
  const hasUpcoming =
    p.pendingExercices.length > 0 || p.upcomingExamens.length > 0 || p.upcomingCompositions.length > 0;
  const passLabel =
    annualAvg != null && p.annual ? formatPassDecision(p.annual) : "/ 20";

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300">
          <GraduationCap className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
            {getTimeGreeting()}, {p.firstName || "…"}
          </h1>
          <p className="truncate text-sm text-slate-600 dark:text-slate-300">{p.classLabel}</p>
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{p.todayCaption}</p>
        </div>
      </section>

      {/* Inbox */}
      {p.unread.discussions > 0 || p.unread.announcements > 0 ? (
        <section className="flex flex-wrap gap-2">
          {p.unread.discussions > 0 ? (
            <Link
              to="/messages"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white"
            >
              <Mail className="h-4 w-4" />
              {p.unread.discussions} message{p.unread.discussions > 1 ? "s" : ""}
            </Link>
          ) : null}
          {p.unread.announcements > 0 ? (
            <Link
              to="/annonces"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
            >
              <Megaphone className="h-4 w-4" />
              {p.unread.announcements} annonce{p.unread.announcements > 1 ? "s" : ""}
            </Link>
          ) : null}
        </section>
      ) : null}

      {/* Timetable changes (kept from the web home) */}
      {p.edtPendingCount > 0 ? (
        <section className={cn(card, "flex items-center gap-3 border-brand-200 bg-brand-50 p-3 dark:border-brand-500/40 dark:bg-brand-950/30")}>
          <CalendarClock className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">Emploi du temps modifié</p>
            <p className="truncate text-xs text-brand-800/90 dark:text-brand-200/90">
              {p.edtPendingCount} modification{p.edtPendingCount > 1 ? "s" : ""}
              {p.edtPendingLabel ? ` · ${p.edtPendingLabel}` : ""}
            </p>
          </div>
          <Link to="/mon-emploi-du-temps" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand-800 dark:text-brand-200">
            Voir
          </Link>
          <button
            type="button"
            onClick={p.onEdtSeen}
            className="flex min-h-11 items-center px-2 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            Vu
          </button>
        </section>
      ) : null}

      <HomeworkTomorrowCard userId={p.userId} moreHref="/mon-cahier" showChildren={false} />

      {/* Today */}
      <NPanel icon={CalendarDays} title="Aujourd’hui" subtitle={todaySubtitle}>
        {p.focus ? (
          <>
            {(() => {
              const s = p.focus.slot;
              const sw = subjectSwatch(s.matieres?.name);
              const live = p.focus.kind === "current";
              const room = formatRoomLabel(s.room);
              return (
                <div className={cn("rounded-2xl border p-3 text-slate-900 dark:text-slate-50", sw.card)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-[11px] font-bold uppercase tracking-wider", live ? "text-rose-700 dark:text-rose-300" : "text-brand-800 dark:text-brand-200")}>
                      {live ? "En cours" : p.focus.isLaterDay ? `Prochain · ${p.focus.dayLabel}` : "Prochain cours"}
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {shortClock(s.start_time)}–{shortClock(s.end_time)}
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-bold">{s.matieres?.name ?? "Cours"}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs font-medium opacity-80">
                    {s.teacherName ? (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {s.teacherName}
                      </span>
                    ) : null}
                    {room ? <span>{room}</span> : null}
                  </p>
                </div>
              );
            })()}
            {laterToday.slice(0, 6).map((s) => {
              const sw = subjectSwatch(s.matieres?.name);
              return (
                <Link
                  key={s.id}
                  to="/mon-emploi-du-temps"
                  className={cn("flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-slate-900 dark:text-slate-50", sw.card)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.matieres?.name ?? "Cours"}</span>
                    <span className="block truncate text-xs opacity-80">
                      {[s.teacherName, formatRoomLabel(s.room)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs font-bold tabular-nums">{shortClock(s.start_time)}</span>
                </Link>
              );
            })}
          </>
        ) : (
          <div className="space-y-1 py-1">
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">
              {p.todaySlots.length === 0 ? "Pas de cours prévu" : "Journée terminée"}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {p.todaySlots.length === 0
                ? "Profite de ta journée libre, ou consulte la semaine."
                : "Plus de cours pour aujourd’hui. Reviens demain."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link to="/mon-emploi-du-temps" className="flex min-h-11 items-center justify-center rounded-xl bg-brand-700 text-sm font-semibold text-white">
            Emploi du temps
          </Link>
          <Link
            to="/mon-cahier"
            className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 dark:border-[var(--border)] dark:text-slate-100"
          >
            Cahier
          </Link>
        </div>
      </NPanel>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2">
        <StatTile
          to="/mon-bulletin"
          label="Moyenne"
          value={annualAvg != null ? formatAverage(annualAvg, 1) : "—"}
          hint={annualAvg == null ? "En attente" : annualAvg >= 10 ? "Sur la bonne voie" : "À renforcer"}
          tone={averageTone(annualAvg)}
          icon={TrendingUp}
        />
        <StatTile
          to="/mes-presences"
          label="Présence"
          value={p.attendanceRate != null ? `${p.attendanceRate}%` : "—"}
          hint={
            p.attendanceRate == null
              ? "Pas encore de saisie"
              : `${p.absencesCount} abs · ${p.lateCount} ret`
          }
          tone={
            p.attendanceRate == null
              ? "text-slate-500 dark:text-slate-300"
              : p.attendanceRate >= 85
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
          }
          icon={CheckCircle2}
        />
        <StatTile
          to="/mes-notes"
          label="Notes"
          value={String(p.notesCount)}
          hint="Publiées"
          tone="text-sky-700 dark:text-sky-400"
          icon={PencilLine}
        />
      </section>

      {/* Bulletin */}
      <NPanel icon={FileText} title="Bulletin · moyennes" subtitle="Trimestres et moyenne annuelle">
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2].map((i) => (
            <AvgChip key={i} label={`T${i + 1}`} value={trimesters[i]?.generalAverage ?? null} footer="/ 20" />
          ))}
          <AvgChip label="Année" value={annualAvg} footer={passLabel} highlight />
        </div>
        <Link to="/mon-bulletin" className="mt-1 flex min-h-11 items-center justify-center rounded-xl bg-brand-700 text-sm font-semibold text-white">
          Voir mon bulletin
        </Link>
      </NPanel>

      {/* To prepare */}
      {hasUpcoming ? (
        <NPanel icon={Bell} title="À préparer" subtitle="Exercices, devoirs et compositions">
          {p.pendingExercices.slice(0, 3).map((e) => (
            <UpcomingRow key={e.id} to="/mes-exercices" badge="Exercice" title={e.title || e.matieres?.name || "Exercice"} subtitle={e.matieres?.name} date={e.due_date} />
          ))}
          {p.upcomingExamens.slice(0, 3).map((e) => (
            <UpcomingRow key={e.id} to="/mes-devoirs" badge="Devoir" title={e.title || e.matieres?.name || "Devoir"} subtitle={e.matieres?.name} date={e.due_date} />
          ))}
          {p.upcomingCompositions.slice(0, 2).map((c) => (
            <UpcomingRow key={c.id} to="/mes-compositions" badge="Compo" title={c.title || "Composition"} subtitle={c.period_label} date={c.starts_on} />
          ))}
        </NPanel>
      ) : null}

      {/* Latest grades */}
      <NPanel
        icon={TrendingUp}
        title="Dernières notes"
        subtitle={p.recentNotes.length === 0 ? "Rien pour le moment" : "Tes résultats récents"}
      >
        {p.recentNotes.length === 0 ? (
          <p className={cn(inner, "px-3 py-6 text-center text-sm font-medium text-slate-600 dark:text-slate-300")}>
            Les notes publiées apparaîtront ici.
          </p>
        ) : (
          p.recentNotes.slice(0, 5).map((n) => {
            const v =
              n.is_absent || n.score == null || !n.max_score ? null : (n.score / n.max_score) * 20;
            const sw = subjectSwatch(n.matieres?.name);
            return (
              <Link key={n.id} to="/mes-notes" className={cn(inner, "flex min-h-14 items-center gap-3 px-3 py-2")}>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold text-slate-900 dark:text-slate-50",
                    sw.card,
                  )}
                  aria-hidden
                >
                  {(n.matieres?.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {n.evalTitle || n.matieres?.name || "Matière"}
                  </span>
                  <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
                    {[n.matieres?.name, n.period_label].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={cn("shrink-0 text-base font-bold tabular-nums", v == null ? "text-amber-600 dark:text-amber-400" : averageTone(v))}>
                  {v == null ? "Abs" : v.toFixed(1)}
                </span>
              </Link>
            );
          })
        )}
      </NPanel>

      {/* Shortcuts */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Raccourcis</h2>
        <div className="grid grid-cols-2 gap-2">
          {SHORTCUTS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(card, "flex min-h-16 items-center gap-3 px-3 py-2 active:bg-slate-50 dark:active:bg-[var(--surface-2)]")}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function UpcomingRow({
  to,
  badge,
  title,
  subtitle,
  date,
}: {
  to: string;
  badge: string;
  title: string;
  subtitle?: string | null;
  date: string | null;
}) {
  return (
    <Link to={to} className={cn(inner, "flex min-h-14 items-center gap-2 px-3 py-2")}>
      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        {subtitle ? <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{subtitle}</span> : null}
      </span>
      {date ? (
        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {formatDateSafe(date, "d MMM", { locale: fr })}
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    </Link>
  );
}
