import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import {
  ArrowRight,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  MessageSquare,
  PartyPopper,
  Users,
  type LucideIcon,
} from "lucide-react";
import { relativeFr, snippet } from "@/lib/portalHomeFormat";
import { formatDateSafe } from "@/lib/dateFr";
import {
  computeAnnualAverage,
  formatAverage,
  formatPassDecision,
  TRIMESTER_PERIODS,
  type AnnualAverageResult,
} from "@/lib/averages";
import { fetchAnnualAverage } from "@/lib/annualAverage";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { subjectSwatch } from "@/lib/subjectColors";
import { Button } from "@/components/ui";
import { HomeworkTomorrowCard } from "@/components/HomeworkTomorrowCard";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { fetchAttendanceCounts } from "@/lib/scaleApi";
import { cn, fullName } from "@/lib/utils";
import type { GradeRow, Subject } from "@/lib/types";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};

function dbDayOfWeek(date = new Date()) {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

function on20(score: number, max: number) {
  if (max <= 0) return null;
  return (score / max) * 20;
}

/** Whole days from today to an ISO day (negative = past). */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

function countdownLabel(days: number | null): { text: string; urgent: boolean } | null {
  if (days == null) return null;
  if (days < 0) return { text: "En cours", urgent: false };
  if (days === 0) return { text: "Aujourd’hui", urgent: true };
  if (days === 1) return { text: "Demain", urgent: true };
  return { text: `Dans ${days} j`, urgent: days <= 3 };
}

function durationLabel(minutes: number) {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")}`;
}

function gradeTone(value: number | null) {
  if (value == null) return "text-slate-400";
  if (value >= 12) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 10) return "text-sky-600 dark:text-sky-400";
  return "text-rose-600 dark:text-rose-400";
}

function gradeBar(value: number | null) {
  if (value == null) return "bg-slate-200 dark:bg-slate-600";
  if (value >= 12) return "bg-emerald-500";
  if (value >= 10) return "bg-sky-500";
  return "bg-rose-500";
}

/** Live clock for the "Maintenant" card and the day timeline. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

type UpcomingKind = "exercice" | "devoir" | "composition";

type UpcomingItem = {
  id: string;
  kind: UpcomingKind;
  title: string;
  subject: string | null;
  day: string | null;
  detail: string | null;
  to: string;
};

const KIND_STYLE: Record<UpcomingKind, { label: string; badge: string; block: string }> = {
  exercice: {
    label: "Exercice",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    block: "bg-amber-500",
  },
  devoir: {
    label: "Devoir",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    block: "bg-sky-600",
  },
  composition: {
    label: "Composition",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
    block: "bg-violet-600",
  },
};

export default function StudentHome() {
  const { user, profile } = useAuth();
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const { pending: edtPending, pendingCount: edtPendingCount, markSeen } =
    useEdtPendingChanges();
  const now = useNow();

  const { data, isLoading } = useQuery({
    queryKey: ["student-home", "v5", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const uid = user!.id;

      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name, grade_level)")
        .eq("student_id", uid)
        .eq("status", "active")
        .maybeSingle();

      const row = enrollment as {
        class_section_id?: string;
        classes?: { name: string; grade_level: string | null } | null;
      } | null;
      const classId = row?.class_section_id;

      const { data: notesData } = await supabase
        .from("notes")
        .select(
          "id, score, max_score, period_label, subject_id, evaluation_id, created_at, is_absent, matieres(id, name, coefficient)",
        )
        .eq("student_id", uid)
        .order("created_at", { ascending: false });

      const { count: notesCountExact } = await supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("student_id", uid);

      const notes = (notesData ?? []) as unknown as (GradeRow & {
        matieres: Subject | null;
      })[];
      const gradedEvalIds = new Set(
        notes
          .map((n) => n.evaluation_id)
          .filter((id): id is string => !!id),
      );

      // one shared calculation (database), same as the bulletin and the class ranking
      // (if it is unavailable the card shows "—" instead of a number computed another way)
      const annual: AnnualAverageResult = classId
        ? await fetchAnnualAverage(uid, classId).catch(() =>
            computeAnnualAverage([]),
          )
        : computeAnnualAverage([]);

      // exact rate over the whole history, computed in SQL (was: last 120 rows only)
      const att = await fetchAttendanceCounts(uid);
      const presentish = att.present + att.late + att.excused;
      const attendanceRate =
        att.total > 0 ? Math.round((presentish / att.total) * 100) : null;
      const absencesCount = att.absent;

      let pendingExercices: {
        id: string;
        title: string;
        due_date: string | null;
        matieres: { name: string } | null;
      }[] = [];
      let upcomingExamens: {
        id: string;
        title: string;
        due_date: string | null;
        start_time: string | null;
        end_time: string | null;
        matieres: { name: string } | null;
        admin_confirmed: boolean;
      }[] = [];
      let upcomingCompositions: {
        id: string;
        title: string;
        period_label: string;
        starts_on: string;
        ends_on: string;
        paperCount: number;
      }[] = [];
      let todaySlots: {
        id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
        room: string | null;
        matieres: { name: string } | null;
      }[] = [];
      let weekSlots: typeof todaySlots = [];

      if (classId) {
        const todayIso = new Date().toISOString().slice(0, 10);
        // only what is still to come (or undated): ordering the whole history
        // oldest-first with a small limit returned old, already graded work,
        // so new homework never reached this card
        const { data: exercicesData } = await supabase
          .from("evaluations")
          .select("id, title, due_date:eval_date, matieres(name)")
          .eq("class_section_id", classId)
          .eq("type", "devoir")
          .or(`eval_date.gte.${todayIso},eval_date.is.null`)
          .order("eval_date", { ascending: true })
          .limit(50);

        pendingExercices = (
          (exercicesData ?? []) as unknown as {
            id: string;
            title: string;
            due_date: string | null;
            matieres: { name: string } | null;
          }[]
        ).filter((e) => !gradedEvalIds.has(e.id));

        const { data: examensData } = await supabase
          .from("evaluations")
          .select(
            "id, title, due_date:eval_date, start_time, end_time, admin_confirmed, matieres(name)",
          )
          .eq("class_section_id", classId)
          .eq("type", "examen")
          .eq("admin_confirmed", true)
          .or(`eval_date.gte.${todayIso},eval_date.is.null`)
          .order("eval_date", { ascending: true })
          .limit(12);

        upcomingExamens = (
          (examensData ?? []) as unknown as {
            id: string;
            title: string;
            due_date: string | null;
            start_time: string | null;
            end_time: string | null;
            admin_confirmed: boolean;
            matieres: { name: string } | null;
          }[]
        )
          .filter(
            (e) =>
              !gradedEvalIds.has(e.id) &&
              (!e.due_date || e.due_date >= todayIso),
          )
          .slice(0, 4);

        const { data: sessionsData } = await supabase
          .from("composition_sessions")
          .select("id, title, period_label, starts_on, ends_on")
          .eq("class_section_id", classId)
          .gte("ends_on", todayIso)
          .order("starts_on", { ascending: true })
          .limit(4);

        const sessions = (sessionsData ?? []) as {
          id: string;
          title: string;
          period_label: string;
          starts_on: string;
          ends_on: string;
        }[];

        if (sessions.length > 0) {
          const { data: papers } = await supabase
            .from("evaluations")
            .select("id, session_id")
            .in(
              "session_id",
              sessions.map((s) => s.id),
            )
            .eq("type", "composition");
          const countBySession = new Map<string, number>();
          for (const p of (papers ?? []) as {
            id: string;
            session_id: string;
          }[]) {
            countBySession.set(
              p.session_id,
              (countBySession.get(p.session_id) ?? 0) + 1,
            );
          }
          upcomingCompositions = sessions.map((s) => ({
            ...s,
            paperCount: countBySession.get(s.id) ?? 0,
          }));
        }

        const todayDow = dbDayOfWeek();
        const { data: slots } = await supabase
          .from("creneaux_edt")
          .select("id, day_of_week, start_time, end_time, room, matieres(name)")
          .eq("class_section_id", classId)
          .order("day_of_week")
          .order("start_time");
        weekSlots = (slots ?? []) as unknown as typeof weekSlots;
        todaySlots = weekSlots.filter((s) => s.day_of_week === todayDow);
      }

      const { data: msgData } = await supabase
        .from("messages")
        .select(
          "id, subject, body, created_at, read_at, is_announcement, sender:profils!messages_sender_id_fkey(first_name, last_name)",
        )
        .eq("recipient_id", uid)
        .order("created_at", { ascending: false })
        .limit(30);

      type Msg = {
        id: string;
        subject: string | null;
        body: string;
        created_at: string;
        read_at: string | null;
        is_announcement: boolean;
        sender: { first_name: string; last_name: string } | null;
      };

      const allMsgs = (msgData ?? []) as unknown as Msg[];
      const announcements = allMsgs
        .filter((m) => m.is_announcement)
        .slice(0, 3);
      const recentMessages = allMsgs
        .filter((m) => !m.is_announcement)
        .slice(0, 3);

      return {
        className: row?.classes?.name ?? null,
        gradeLevel: row?.classes?.grade_level ?? null,
        annual,
        attendanceRate,
        absencesCount,
        notesCount: notesCountExact ?? notes.length,
        recentNotes: notes.slice(0, 5).map((n) => ({
          id: n.id,
          score: n.score,
          max_score: n.max_score,
          period_label: n.period_label,
          // selected above, not part of the shared GradeRow type
          created_at: (n as { created_at?: string }).created_at ?? "",
          matieres: n.matieres
            ? { name: n.matieres.name }
            : null,
        })),
        pendingExercices,
        upcomingExamens,
        upcomingCompositions,
        todaySlots,
        weekSlots,
        announcements,
        recentMessages,
        todayLabel: WEEKDAY_LABELS[dbDayOfWeek()] ?? "Aujourd’hui",
      };
    },
  });

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDow = dbDayOfWeek(now);

  /** Current/next today, or first class on a later day (e.g. Monday after Saturday). */
  const scheduleFocus = useMemo(() => {
    const week = data?.weekSlots ?? [];
    if (week.length === 0) return null;

    const todayList = week
      .filter((s) => s.day_of_week === todayDow)
      .sort(
        (a, b) =>
          timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
      );

    const current = todayList.find((s) => {
      const start = timeToMinutes(s.start_time);
      const end = timeToMinutes(s.end_time);
      return start <= nowMinutes && nowMinutes < end;
    });
    if (current) {
      return {
        slot: current,
        kind: "current" as const,
        dayLabel: WEEKDAY_LABELS[todayDow] ?? "Aujourd’hui",
        isLaterDay: false,
      };
    }

    const nextToday = todayList.find(
      (s) => timeToMinutes(s.start_time) > nowMinutes,
    );
    if (nextToday) {
      return {
        slot: nextToday,
        kind: "next" as const,
        dayLabel: WEEKDAY_LABELS[todayDow] ?? "Aujourd’hui",
        isLaterDay: false,
      };
    }

    for (let offset = 1; offset <= 7; offset++) {
      const day = ((todayDow - 1 + offset) % 7) + 1;
      const dayList = week
        .filter((s) => s.day_of_week === day)
        .sort(
          (a, b) =>
            timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
        );
      const first = dayList[0];
      if (!first) continue;
      return {
        slot: first,
        kind: "next" as const,
        dayLabel: WEEKDAY_LABELS[day] ?? "Prochain jour",
        isLaterDay: true,
      };
    }

    return null;
  }, [data?.weekSlots, todayDow, nowMinutes]);

  /** Exercices, devoirs and compositions merged into one dated list. */
  const upcoming = useMemo<UpcomingItem[]>(() => {
    if (!data) return [];
    const items: UpcomingItem[] = [
      ...(data.pendingExercices ?? []).map((d) => ({
        id: `ex-${d.id}`,
        kind: "exercice" as const,
        title: d.title,
        subject: d.matieres?.name ?? null,
        day: d.due_date,
        detail: "À présenter en classe",
        to: "/mes-exercices",
      })),
      ...(data.upcomingExamens ?? []).map((e) => {
        const start = e.start_time?.slice(0, 5);
        const end = e.end_time?.slice(0, 5);
        return {
          id: `dv-${e.id}`,
          kind: "devoir" as const,
          title: e.title,
          subject: e.matieres?.name ?? null,
          day: e.due_date,
          detail: start && end ? `${start}–${end}` : (start ?? null),
          to: "/mes-devoirs",
        };
      }),
      ...(data.upcomingCompositions ?? []).map((c) => ({
        id: `co-${c.id}`,
        kind: "composition" as const,
        title: c.title,
        subject: c.period_label,
        day: c.starts_on,
        detail: [
          c.paperCount > 0 ? `${c.paperCount} épreuve${c.paperCount > 1 ? "s" : ""}` : null,
          `jusqu’au ${formatDateSafe(c.ends_on, "d MMM", { locale: fr })}`,
        ]
          .filter(Boolean)
          .join(" · "),
        to: "/mes-compositions",
      })),
    ];
    return items.sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999"));
  }, [data]);

  if (isLoading) {
    return <HomeSkeleton />;
  }

  if (!data) {
    return (
      <p className="text-slate-500">Impossible de charger votre aperçu.</p>
    );
  }

  const firstName = profile?.first_name?.trim() || "";
  const classLabel = [data.className ?? "Sans classe", data.gradeLevel]
    .filter(Boolean)
    .join(" · ");
  const annual = data.annual;
  const todaySlots = [...(data.todaySlots ?? [])].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
  );
  const unreadTotal = unreadInbox.discussions + unreadInbox.announcements;

  return (
    <div className="space-y-6">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 via-navy-700 to-brand-700 text-white shadow-lg shadow-navy-800/20">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />

        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
              {formatDateSafe(now.toISOString(), "EEEE d MMMM", { locale: fr })}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">
              Bonjour{firstName ? `, ${firstName}` : ""} 👋
            </h1>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-white/85">
              <GraduationCap className="h-4 w-4" />
              {classLabel}
            </p>
            {unreadTotal > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {unreadInbox.discussions > 0 ? (
                  <Link
                    to="/messages"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/20 transition hover:bg-white/25"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {unreadInbox.discussions} message{unreadInbox.discussions > 1 ? "s" : ""} non lu
                    {unreadInbox.discussions > 1 ? "s" : ""}
                  </Link>
                ) : null}
                {unreadInbox.announcements > 0 ? (
                  <Link
                    to="/annonces"
                    className="inline-flex items-center gap-1.5 rounded-full bg-faso-yellow/25 px-3 py-1.5 text-xs font-semibold ring-1 ring-faso-yellow/40 transition hover:bg-faso-yellow/35"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {unreadInbox.announcements} annonce{unreadInbox.announcements > 1 ? "s" : ""}
                  </Link>
                ) : null}
              </div>
            ) : null}
            </div>

          <div className="grid grid-cols-3 gap-3">
            <HeroStat
              to="/mon-bulletin"
              label="Moyenne"
              value={annual?.annualAverage != null ? formatAverage(annual.annualAverage, 1) : "—"}
              hint={
                annual?.annualAverage != null
                  ? `${formatPassDecision(annual)}${!annual.complete ? " · provisoire" : ""}`
                  : "Pas de notes"
              }
            />
            <HeroStat
              to="/mes-presences"
              label="Présence"
              value={data.attendanceRate != null ? `${data.attendanceRate}%` : "—"}
              hint={
                data.attendanceRate != null
                  ? `${data.absencesCount} absence${data.absencesCount > 1 ? "s" : ""}`
                  : "Aucune saisie"
              }
            />
            <HeroStat
              to="/mes-exercices"
              label="À préparer"
              value={String(upcoming.length)}
              hint={upcoming.length > 0 ? "à venir" : "Rien à rendre"}
            />
          </div>
          </div>

          <div className="lg:col-span-5">
            <NowCard focus={scheduleFocus} nowMinutes={nowMinutes} />
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      <HomeworkTomorrowCard userId={user?.id} moreHref="/mon-cahier" showChildren={false} />

      {edtPendingCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-500/40 dark:bg-brand-950/30">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                Emploi du temps modifié
              </p>
              <p className="mt-0.5 text-xs text-brand-800/90 dark:text-brand-200/90">
                {edtPendingCount} modification
                {edtPendingCount > 1 ? "s" : ""}
                {edtPending[0]?.label ? ` · ${edtPending[0].label}` : ""}
                {edtPendingCount > 1 ? "…" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Link to="/mon-emploi-du-temps">
              <Button size="sm">Voir l’emploi du temps</Button>
            </Link>
            <Button type="button" size="sm" variant="outline" onClick={() => markSeen()}>
              Marquer comme vu
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------- Body ---------- */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <UpcomingCard items={upcoming} />
          <ResultsCard
            annual={annual}
            notesCount={data.notesCount}
            recentNotes={data.recentNotes ?? []}
          />
        </div>

        <div className="space-y-6 lg:col-span-4">
          <DayTimeline
            dayLabel={data.todayLabel}
            slots={todaySlots}
            nowMinutes={nowMinutes}
            focus={scheduleFocus}
          />
          <InboxCard
            announcements={data.announcements ?? []}
            messages={data.recentMessages ?? []}
          />
          <Shortcuts />
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */

type Slot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  matieres: { name: string } | null;
};

type Focus = {
  slot: Slot;
  kind: "current" | "next";
  dayLabel: string;
  isLaterDay: boolean;
} | null;

function roomLabel(room: string | null) {
  const r = room?.trim();
  if (!r) return null;
  return /^salle/i.test(r) ? r : `Salle ${r}`;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm lg:p-6 dark:border-white/10",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function HeroStat({
  to,
  label,
  value,
  hint,
}: {
  to: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 transition hover:bg-white/15"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums lg:text-[1.75rem]">{value}</p>
      <p className="mt-0.5 truncate text-xs text-white/75">{hint}</p>
    </Link>
  );
}

function NowCard({ focus, nowMinutes }: { focus: Focus; nowMinutes: number }) {
  if (!focus) {
    return (
      <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Maintenant</p>
        <p className="mt-2 text-lg font-semibold">Pas de cours prévu cette semaine</p>
      </div>
    );
  }
  const start = timeToMinutes(focus.slot.start_time);
  const end = timeToMinutes(focus.slot.end_time);
  const isCurrent = focus.kind === "current";
  const progress = isCurrent ? Math.min(100, Math.max(0, ((nowMinutes - start) / (end - start)) * 100)) : 0;
  const room = roomLabel(focus.slot.room);

  const status = isCurrent
    ? `Se termine dans ${durationLabel(end - nowMinutes)}`
    : focus.isLaterDay
      ? `${focus.dayLabel} à ${focus.slot.start_time.slice(0, 5)}`
      : `Commence dans ${durationLabel(start - nowMinutes)}`;

  return (
    <Link
      to="/mon-emploi-du-temps"
      className="block rounded-2xl bg-white p-5 text-slate-900 shadow-xl shadow-navy-900/20 transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
            isCurrent ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800",
          )}
        >
          {isCurrent ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {isCurrent ? "En cours" : "Prochain cours"}
        </span>
        <span className="text-xs font-semibold tabular-nums text-slate-500">
          {focus.slot.start_time.slice(0, 5)}–{focus.slot.end_time.slice(0, 5)}
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-bold text-slate-900">{focus.slot.matieres?.name ?? "Cours"}</p>
      <p className="mt-0.5 text-sm text-slate-500">
        {[room, status].filter(Boolean).join(" · ")}
      </p>
      {isCurrent ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </Link>
  );
}

function DateBlock({ iso, tone }: { iso: string | null; tone: string }) {
  return (
    <div className="w-14 shrink-0 overflow-hidden rounded-xl text-center ring-1 ring-slate-200 dark:ring-white/10">
      <div className={cn("py-0.5 text-[10px] font-bold uppercase tracking-wider text-white", tone)}>
        {iso ? formatDateSafe(iso, "MMM", { locale: fr }).replace(".", "") : "—"}
      </div>
      <div className="bg-white py-1.5 text-xl font-bold tabular-nums text-slate-900">
        {iso ? formatDateSafe(iso, "d", { locale: fr }) : "?"}
      </div>
    </div>
  );
}

function UpcomingCard({ items }: { items: UpcomingItem[] }) {
  return (
    <Card>
      <CardHeader
        title="À préparer"
        subtitle={
          items.length > 0
            ? `${items.length} à venir · exercices, devoirs et compositions`
            : "Exercices, devoirs et compositions"
        }
        action={
          <div className="hidden items-center gap-1 sm:flex">
            <HeaderLink to="/mes-exercices">Exercices</HeaderLink>
            <HeaderLink to="/mes-devoirs">Devoirs</HeaderLink>
          </div>
        }
      />
      {items.length === 0 ? (
        <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-5 dark:bg-emerald-500/10">
          <PartyPopper className="h-8 w-8 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-slate-900">Rien à préparer pour le moment</p>
            <p className="text-sm text-slate-500">Les prochains exercices, devoirs et compositions apparaîtront ici.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {items.slice(0, 6).map((item) => {
            const style = KIND_STYLE[item.kind];
            const countdown = countdownLabel(daysUntil(item.day));
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className="-mx-2 flex items-center gap-4 rounded-2xl px-2 py-3 transition hover:bg-slate-50"
                >
                  <DateBlock iso={item.day} tone={style.block} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", style.badge)}>
                        {style.label}
                      </span>
                      {item.subject ? (
                        <span className="text-xs font-medium text-slate-500">{item.subject}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-semibold text-slate-900">{item.title}</p>
                    {item.detail ? <p className="truncate text-xs text-slate-500">{item.detail}</p> : null}
                  </div>
                  {countdown ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
                        countdown.urgent
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {countdown.text}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 6 ? (
        <p className="mt-3 text-center text-xs text-slate-500">
          +{items.length - 6} autre{items.length - 6 > 1 ? "s" : ""} — voir les pages Exercices, Devoirs et Compositions
        </p>
      ) : null}
    </Card>
  );
}

function ResultsCard({
  annual,
  notesCount,
  recentNotes,
}: {
  annual: AnnualAverageResult;
  notesCount: number;
  recentNotes: {
    id: string;
    score: number;
    max_score: number;
    period_label: string;
    created_at: string;
    matieres: { name: string } | null;
  }[];
}) {
  const trimesters = TRIMESTER_PERIODS.map((period, i) => {
    const t = annual?.trimesters?.find((x) => x.periodLabel === period) ?? annual?.trimesters?.[i];
    return { label: `T${i + 1}`, value: t?.generalAverage ?? null };
  });
  const yearly = annual?.annualAverage ?? null;

  return (
    <Card>
      <CardHeader
        title="Mes résultats"
        subtitle={`${notesCount} note${notesCount > 1 ? "s" : ""} publiée${notesCount > 1 ? "s" : ""}`}
        action={<HeaderLink to="/mon-bulletin">Bulletin</HeaderLink>}
      />
      <div className="grid gap-6 md:grid-cols-5">
        {/* Trimester chart + year */}
        <div className="md:col-span-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Moyenne annuelle</p>
                <p className={cn("mt-1 text-4xl font-bold tabular-nums", gradeTone(yearly))}>
                  {formatAverage(yearly, 1)}
                  <span className="ml-1 text-base font-semibold text-slate-400">/20</span>
                </p>
              </div>
              {yearly != null ? (
                <span
                  className={cn(
                    "mb-1 rounded-full px-2.5 py-1 text-xs font-bold",
                    yearly >= 10
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
                  )}
                >
                  {formatPassDecision(annual)}
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex items-end gap-3">
              {trimesters.map((t) => (
                <div key={t.label} className="flex flex-1 flex-col items-center gap-1.5">
                  {/* value sits right on top of its bar; bar height is the average out of 20 */}
                  <div className="flex h-28 w-full flex-col items-center justify-end gap-1">
                    <span className={cn("text-sm font-bold tabular-nums", gradeTone(t.value))}>
                      {formatAverage(t.value, 1)}
                    </span>
                    <div
                      className={cn("w-full rounded-t-lg rounded-b-sm transition-all", gradeBar(t.value))}
                      style={{ height: `${t.value != null ? Math.max(6, (t.value / 20) * 80) : 4}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{t.label}</span>
                </div>
              ))}
            </div>
            {annual && !annual.complete && yearly != null ? (
              <p className="mt-3 text-[11px] text-slate-500">Moyenne provisoire : l’année n’est pas terminée.</p>
            ) : null}
          </div>
        </div>

        {/* Latest grades */}
        <div className="md:col-span-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dernières notes</p>
          {recentNotes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Aucune note pour le moment.
            </p>
          ) : (
            <ul className="space-y-1">
              {recentNotes.map((n) => {
                const v = on20(n.score, n.max_score);
                const swatch = subjectSwatch(n.matieres?.name);
                return (
                  <li key={n.id}>
                    <Link
                      to="/mes-notes"
                      className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50"
                    >
                      <span className={cn("h-9 w-1.5 shrink-0 rounded-full", swatch.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {n.matieres?.name ?? "Matière"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {[n.period_label, formatDateSafe(n.created_at, "d MMM", { locale: fr })]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <p className={cn("shrink-0 text-lg font-bold tabular-nums", gradeTone(v))}>
                        {v != null ? formatAverage(v, 1) : "—"}
                        <span className="ml-0.5 text-xs font-medium text-slate-400">/20</span>
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/mes-notes"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            Toutes mes notes <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

function DayTimeline({
  dayLabel,
  slots,
  nowMinutes,
  focus,
}: {
  dayLabel: string;
  slots: Slot[];
  nowMinutes: number;
  focus: Focus;
}) {
  const remaining = slots.filter((s) => timeToMinutes(s.end_time) > nowMinutes).length;
  return (
    <Card>
      <CardHeader
        title="Ma journée"
        subtitle={
          slots.length === 0
            ? `${dayLabel} · pas de cours`
            : remaining > 0
              ? `${dayLabel} · ${remaining} cours restant${remaining > 1 ? "s" : ""}`
              : `${dayLabel} · journée terminée`
        }
        action={<HeaderLink to="/mon-emploi-du-temps">Semaine</HeaderLink>}
      />
      {slots.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          {focus?.isLaterDay ? (
            <>
              Pas de cours aujourd’hui. Prochain :{" "}
              <span className="font-semibold text-slate-900">
                {focus.slot.matieres?.name ?? "Cours"}
              </span>{" "}
              · {focus.dayLabel} à {focus.slot.start_time.slice(0, 5)}
            </>
          ) : (
            "Pas de cours prévu cette semaine."
          )}
        </div>
      ) : (
        <ol className="relative">
          {slots.map((s, i) => {
            const start = timeToMinutes(s.start_time);
            const end = timeToMinutes(s.end_time);
            const done = end <= nowMinutes;
            const current = start <= nowMinutes && nowMinutes < end;
            const last = i === slots.length - 1;
            return (
              <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                {!last ? (
                  <span
                    className={cn(
                      "absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5",
                      done ? "bg-brand-200 dark:bg-brand-800" : "bg-slate-200 dark:bg-white/10",
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    done
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-900"
                      : current
                        ? "bg-emerald-500 text-white ring-4 ring-emerald-100 dark:ring-emerald-500/20"
                        : "border-2 border-slate-300 bg-white dark:border-white/20",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : current ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-2xl px-3 py-2",
                    current ? "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30" : "",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm font-semibold", done ? "text-slate-400" : "text-slate-900")}>
                      {s.matieres?.name ?? "Cours"}
                    </p>
                    <span className={cn("shrink-0 text-xs font-semibold tabular-nums", done ? "text-slate-400" : "text-slate-600")}>
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </span>
                  </div>
                  <p className={cn("text-xs", done ? "text-slate-400" : "text-slate-500")}>
                    {current ? `En cours · ${roomLabel(s.room) ?? ""}`.replace(/ · $/, "") : (roomLabel(s.room) ?? "")}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function InboxCard({
  announcements,
  messages,
}: {
  announcements: { id: string; subject: string | null; body: string; created_at: string; read_at: string | null }[];
  messages: {
    id: string;
    subject: string | null;
    body: string;
    created_at: string;
    read_at: string | null;
    sender: { first_name: string; last_name: string } | null;
  }[];
}) {
  return (
    <Card>
      <CardHeader title="Messages & annonces" action={<HeaderLink to="/messages">Ouvrir</HeaderLink>} />
      {messages.length === 0 && announcements.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun message pour le moment.</p>
      ) : (
        <ul className="space-y-1">
          {announcements.slice(0, 2).map((m) => (
            <li key={m.id}>
              <Link to="/annonces" className="-mx-2 flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{m.subject?.trim() || "Annonce"}</p>
                    <span className="shrink-0 text-[11px] text-slate-400">{relativeFr(m.created_at)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{snippet(m.body, 80)}</p>
                </div>
              </Link>
            </li>
          ))}
          {messages.slice(0, 3).map((m) => {
            const sender = m.sender ? fullName(m.sender.first_name, m.sender.last_name) : "Expéditeur";
            const unread = !m.read_at;
            return (
              <li key={m.id}>
                <Link to="/messages" className="-mx-2 flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                    {sender
                      .split(" ")
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")
                      .toUpperCase()}
                    {unread ? (
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-brand-500 ring-2 ring-white dark:ring-[var(--surface)]" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-sm text-slate-900", unread ? "font-bold" : "font-semibold")}>{sender}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">{relativeFr(m.created_at)}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {[m.subject?.trim(), snippet(m.body, 60)].filter(Boolean).join(" — ")}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const SHORTCUTS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/mes-notes", label: "Mes notes", icon: BookOpen },
  { to: "/mon-bulletin", label: "Bulletin", icon: GraduationCap },
  { to: "/mes-exercices", label: "Exercices", icon: ClipboardList },
  { to: "/mes-devoirs", label: "Devoirs", icon: FileText },
  { to: "/mes-compositions", label: "Compositions", icon: BookMarked },
  { to: "/mes-presences", label: "Présences", icon: CheckCircle2 },
  { to: "/mon-emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
  { to: "/mes-profs", label: "Mes profs", icon: Users },
];

function Shortcuts() {
  return (
    <Card>
      <CardHeader title="Raccourcis" />
      <div className="grid grid-cols-2 gap-2">
        {SHORTCUTS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-brand-50 hover:text-brand-800 dark:text-slate-200"
          >
            <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="h-56 animate-pulse rounded-3xl bg-navy-700/20" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-56 animate-pulse rounded-3xl bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
