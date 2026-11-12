import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { fr } from "date-fns/locale";
import {
  BarChart3,
  BadgeCheck,
  BellRing,
  Book,
  CalendarClock,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ClipboardPen,
  FileBarChart,
  FileText,
  Files,
  GraduationCap,
  Mail,
  MapPin,
  Megaphone,
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

const INK = "text-[#0f172a] dark:text-slate-100";
const MUTED = "text-[#64748b] dark:text-slate-300";
const TEAL = "#0f766e";
const NAVY = "#153064";
const RED = "#d4372e";
const GREEN = "#4b8f4a";
const ORANGE = "#ff9500";
const SKY = "#0284c7";
const YELLOW = "#efac42";

const rgb = (c: readonly [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const tint = (hex: string) => `${hex}1f`; // color.opacity(0.12)

/** HomePanel: icon tile + headline/caption, then the content (14 pt apart). */
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
    <section className="ios-panel space-y-[14px]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f0fdfa] text-[#0f766e] dark:bg-brand-900/30 dark:text-brand-300">
          <Icon className="h-[17px] w-[17px]" strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <h2 className={cn("text-[17px] font-semibold leading-snug", INK)}>{title}</h2>
          {subtitle ? <p className={cn("text-xs", MUTED)}>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function averageColor(value: number | null | undefined) {
  if (value == null) return "#64748b";
  return value >= 10 ? TEAL : ORANGE;
}

function StatTile({
  to,
  label,
  value,
  hint,
  color,
  icon: Icon,
}: {
  to: string;
  label: string;
  value: string;
  hint: string;
  color: string;
  icon: LucideIcon;
}) {
  return (
    <Link to={to} className="ios-card18 flex min-h-[142px] min-w-0 flex-col gap-2 p-3 active:opacity-80">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint(color), color }}
      >
        <Icon className="h-[14px] w-[14px]" strokeWidth={2.6} aria-hidden />
      </span>
      <span className="truncate text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className={cn("text-xs font-bold", INK)}>{label}</span>
      <span className={cn("text-[11px] leading-snug", MUTED)}>{hint}</span>
    </Link>
  );
}

function AvgChip({ label, value, footer, highlight }: { label: string; value: number | null; footer: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-[14px] px-1 py-[10px] text-center",
        highlight ? "bg-[#f0fdfa] ring-1 ring-[#0f766e]/20 dark:bg-brand-950/40" : "bg-[#f8fafc] dark:bg-[var(--surface-2)]",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: highlight ? TEAL : "#64748b" }}>
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums" style={{ color: averageColor(value) }}>
        {formatAverage(value, 1)}
      </p>
      <p className="max-w-full truncate text-[11px] font-semibold" style={{ color: highlight ? GREEN : "#64748b" }}>
        {footer}
      </p>
    </div>
  );
}

const SHORTCUTS: { to: string; label: string; icon: LucideIcon; color: string }[] = [
  { to: "/mes-notes", label: "Mes notes", icon: Book, color: NAVY },
  { to: "/mes-presences", label: "Présences", icon: CheckCircle2, color: GREEN },
  { to: "/mes-exercices", label: "Exercices", icon: ClipboardList, color: RED },
  { to: "/mes-devoirs", label: "Devoirs", icon: FileText, color: SKY },
  { to: "/mes-compositions", label: "Compositions", icon: Files, color: TEAL },
  { to: "/mon-bulletin", label: "Bulletin", icon: FileBarChart, color: ORANGE },
  { to: "/mon-emploi-du-temps", label: "Emploi du temps", icon: Calendar, color: NAVY },
  { to: "/mes-profs", label: "Mes profs", icon: Users, color: TEAL },
  { to: "/mon-cahier", label: "Cahier", icon: ClipboardPen, color: YELLOW },
  { to: "/messages", label: "Messages", icon: Mail, color: NAVY },
];

/**
 * Android app — student home, pixel-matched to the SwiftUI StudentHomeView:
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
    <div className="space-y-[18px] px-0.5 pb-1">
      {/* Hero */}
      <section className="flex items-start gap-[14px]">
        <span
          className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[20px] text-white shadow-[0_6px_12px_rgba(21,48,100,0.25)]"
          style={{ background: `linear-gradient(135deg, ${TEAL}, ${NAVY})` }}
        >
          <GraduationCap className="h-[26px] w-[26px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 space-y-[3px]">
          <h1 className={cn("truncate text-[22px] font-bold leading-tight", INK)}>
            {getTimeGreeting()}, {p.firstName || "…"}
          </h1>
          <p className={cn("text-[15px] leading-tight", MUTED)}>{p.classLabel}</p>
          <p className="text-xs font-semibold capitalize text-[#0f766e] dark:text-brand-300">{p.todayCaption}</p>
        </div>
      </section>

      {/* Inbox */}
      {p.unread.discussions > 0 || p.unread.announcements > 0 ? (
        <section className="flex flex-wrap gap-[10px]">
          {p.unread.discussions > 0 ? (
            <Link
              to="/messages"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#153064] px-3 text-xs font-bold text-white"
            >
              <Mail className="h-[13px] w-[13px]" strokeWidth={2.4} />
              {p.unread.discussions} message{p.unread.discussions > 1 ? "s" : ""}
            </Link>
          ) : null}
          {p.unread.announcements > 0 ? (
            <Link
              to="/annonces"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#f0fdfa] px-3 text-xs font-bold text-[#153064] dark:bg-brand-950/40 dark:text-brand-200"
            >
              <Megaphone className="h-[13px] w-[13px]" strokeWidth={2.4} />
              {p.unread.announcements} annonce{p.unread.announcements > 1 ? "s" : ""}
            </Link>
          ) : null}
        </section>
      ) : null}

      {/* Timetable changes (kept from the web home) */}
      {p.edtPendingCount > 0 ? (
        <section className="ios-panel flex items-center gap-3 !p-3">
          <CalendarClock className="h-5 w-5 shrink-0 text-[#0f766e]" />
          <div className="min-w-0 flex-1">
            <p className={cn("text-[15px] font-semibold", INK)}>Emploi du temps modifié</p>
            <p className={cn("truncate text-xs", MUTED)}>
              {p.edtPendingCount} modification{p.edtPendingCount > 1 ? "s" : ""}
              {p.edtPendingLabel ? ` · ${p.edtPendingLabel}` : ""}
            </p>
          </div>
          <Link to="/mon-emploi-du-temps" className="flex min-h-11 items-center px-2 text-[15px] font-bold text-[#153064] dark:text-brand-200">
            Voir
          </Link>
          <button
            type="button"
            onClick={p.onEdtSeen}
            className={cn("flex min-h-11 items-center px-2 text-[15px] font-medium", MUTED)}
          >
            Vu
          </button>
        </section>
      ) : null}

      <HomeworkTomorrowCard userId={p.userId} moreHref="/mon-cahier" showChildren={false} />

      {/* Today */}
      <NPanel icon={Calendar} title="Aujourd’hui" subtitle={todaySubtitle}>
        {p.focus ? (
          <>
            {(() => {
              const s = p.focus.slot;
              const sw = subjectSwatch(s.matieres?.name);
              const live = p.focus.kind === "current";
              const room = formatRoomLabel(s.room);
              return (
                <div
                  className="space-y-[10px] rounded-2xl p-[14px]"
                  style={{ backgroundColor: rgb(sw.fill), border: `1px solid ${rgb(sw.border, 0.45)}` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-bold uppercase tracking-[0.8px]"
                      style={{ color: live ? RED : TEAL }}
                    >
                      {live ? "En cours" : p.focus.isLaterDay ? `Prochain · ${p.focus.dayLabel}` : "Prochain cours"}
                    </span>
                    <span className="text-[15px] font-bold tabular-nums text-[#0f172a]">
                      {shortClock(s.start_time)}–{shortClock(s.end_time)}
                    </span>
                  </div>
                  <p className="text-xl font-bold leading-tight text-[#0f172a]">{s.matieres?.name ?? "Cours"}</p>
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#0f172a]/75">
                    {s.teacherName ? (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" fill="currentColor" />
                        {s.teacherName}
                      </span>
                    ) : null}
                    {room ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {room}
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })()}
            {laterToday.length > 0 ? (
              <div className="space-y-2">
                {laterToday.slice(0, 6).map((s) => {
                  const sw = subjectSwatch(s.matieres?.name);
                  return (
                    <Link
                      key={s.id}
                      to="/mon-emploi-du-temps"
                      className="flex items-center gap-3 rounded-[14px] p-3"
                      style={{ backgroundColor: rgb(sw.fill, 0.65) }}
                    >
                      <span className="h-9 w-1 shrink-0 rounded-[3px]" style={{ backgroundColor: rgb(sw.border) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-[#0f172a]">{s.matieres?.name ?? "Cours"}</span>
                        <span className="block truncate text-xs text-[#64748b]">
                          {[s.teacherName, formatRoomLabel(s.room)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: rgb(sw.border) }}>
                        {shortClock(s.start_time)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <p className={cn("text-xl font-bold", INK)}>
              {p.todaySlots.length === 0 ? "Pas de cours prévu" : "Journée terminée ✨"}
            </p>
            <p className={cn("text-[15px]", MUTED)}>
              {p.todaySlots.length === 0
                ? "Profite de ta journée libre, ou consulte la semaine."
                : "Plus de cours pour aujourd’hui. Reviens demain."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link to="/mon-emploi-du-temps" className="flex min-h-11 items-center justify-center rounded-xl bg-[#153064] py-3 text-[15px] font-bold text-white">
            Emploi du temps
          </Link>
          <Link
            to="/mon-cahier"
            className="flex min-h-11 items-center justify-center rounded-xl bg-[#f8fafc] py-3 text-[15px] font-bold text-[#153064] dark:bg-[var(--surface-2)] dark:text-slate-100"
          >
            Cahier
          </Link>
        </div>
      </NPanel>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-[10px]">
        <StatTile
          to="/mon-bulletin"
          label="Moyenne"
          value={annualAvg != null ? formatAverage(annualAvg, 1) : "—"}
          hint={annualAvg == null ? "En attente" : annualAvg >= 10 ? "Sur la bonne voie" : "À renforcer"}
          color={averageColor(annualAvg)}
          icon={BarChart3}
        />
        <StatTile
          to="/mes-presences"
          label="Présence"
          value={p.attendanceRate != null ? `${p.attendanceRate}%` : "—"}
          hint={p.attendanceRate == null ? "Pas encore de saisie" : `${p.absencesCount} abs · ${p.lateCount} ret`}
          color={p.attendanceRate == null ? "#64748b" : p.attendanceRate >= 85 ? GREEN : ORANGE}
          icon={BadgeCheck}
        />
        <StatTile to="/mes-notes" label="Notes" value={String(p.notesCount)} hint="Publiées" color={SKY} icon={ClipboardPen} />
      </section>

      {/* Bulletin */}
      <NPanel icon={FileText} title="Bulletin · moyennes" subtitle="Trimestres et moyenne annuelle">
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2].map((i) => (
            <AvgChip key={i} label={`T${i + 1}`} value={trimesters[i]?.generalAverage ?? null} footer="/ 20" />
          ))}
          <AvgChip label="Année" value={annualAvg} footer={passLabel} highlight />
        </div>
        <Link to="/mon-bulletin" className="mt-1 flex min-h-11 items-center justify-center rounded-xl bg-[#0f766e] py-3 text-[15px] font-bold text-white">
          Voir mon bulletin
        </Link>
      </NPanel>

      {/* To prepare */}
      {hasUpcoming ? (
        <NPanel icon={BellRing} title="À préparer" subtitle="Exercices, devoirs et compositions">
          <div className="space-y-2">
            {p.pendingExercices.slice(0, 3).map((e) => (
              <UpcomingRow key={e.id} to="/mes-exercices" badge="Exercice" color={RED} title={e.title || e.matieres?.name || "Exercice"} subtitle={e.matieres?.name} date={e.due_date} />
            ))}
            {p.upcomingExamens.slice(0, 3).map((e) => (
              <UpcomingRow key={e.id} to="/mes-devoirs" badge="Devoir" color={NAVY} title={e.title || e.matieres?.name || "Devoir"} subtitle={e.matieres?.name} date={e.due_date} />
            ))}
            {p.upcomingCompositions.slice(0, 2).map((c) => (
              <UpcomingRow key={c.id} to="/mes-compositions" badge="Compo" color={TEAL} title={c.title || "Composition"} subtitle={c.period_label} date={c.starts_on} />
            ))}
          </div>
        </NPanel>
      ) : null}

      {/* Latest grades */}
      <NPanel
        icon={TrendingUp}
        title="Dernières notes"
        subtitle={p.recentNotes.length === 0 ? "Rien pour le moment" : "Tes résultats récents"}
      >
        {p.recentNotes.length === 0 ? (
          <p className="ios-empty">Les notes publiées apparaîtront ici.</p>
        ) : (
          <div className="space-y-2">
            {p.recentNotes.slice(0, 5).map((n) => {
              const v =
                n.is_absent || n.score == null || !n.max_score ? null : (n.score / n.max_score) * 20;
              const sw = subjectSwatch(n.matieres?.name);
              return (
                <Link key={n.id} to="/mes-notes" className="ios-row flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: rgb(sw.fill), border: `1px solid ${rgb(sw.border, 0.5)}`, color: rgb(sw.border) }}
                    aria-hidden
                  >
                    {(n.matieres?.name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[15px] font-semibold", INK)}>
                      {n.evalTitle || n.matieres?.name || "Matière"}
                    </span>
                    <span className={cn("block truncate text-xs", MUTED)}>
                      {[n.matieres?.name, n.period_label].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[17px] font-semibold tabular-nums" style={{ color: v == null ? ORANGE : averageColor(v) }}>
                    {v == null ? "Abs" : v.toFixed(1)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </NPanel>

      {/* Shortcuts */}
      <section className="space-y-3">
        <h2 className={cn("text-[17px] font-semibold", INK)}>Accès rapide</h2>
        <div className="grid grid-cols-2 gap-[10px]">
          {SHORTCUTS.map(({ to, label, icon: Icon, color }) => (
            <Link key={to} to={to} className="ios-tile flex min-h-16 items-center gap-[10px] p-3 active:opacity-80">
              <span
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: tint(color), color }}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={2.3} />
              </span>
              <span className={cn("min-w-0 text-[15px] font-semibold leading-tight", INK)}>{label}</span>
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
  color,
  title,
  subtitle,
  date,
}: {
  to: string;
  badge: string;
  color: string;
  title: string;
  subtitle?: string | null;
  date: string | null;
}) {
  return (
    <Link to={to} className="ios-row flex items-center gap-[10px]">
      <span
        className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold"
        style={{ color, backgroundColor: tint(color) }}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px] font-semibold", INK)}>{title}</span>
        {subtitle ? <span className={cn("block truncate text-xs", MUTED)}>{subtitle}</span> : null}
      </span>
      {date ? (
        <span className="shrink-0 text-xs font-semibold tabular-nums text-[#153064] dark:text-slate-100">
          {formatDateSafe(date, "d MMM", { locale: fr })}
        </span>
      ) : null}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#64748b]/70" strokeWidth={2.6} aria-hidden />
    </Link>
  );
}
