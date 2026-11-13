import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import {
  Bell,
  BookMarked,
  BookOpen,
  Calendar,
  CalendarClock,
  Check,
  Clock,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Panel,
  PanelEmpty,
  QuickLink,
} from "@/components/PortalHomeKit";
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
import { Button } from "@/components/ui";
import { HomeworkTomorrowCard } from "@/components/HomeworkTomorrowCard";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { fetchAttendanceCounts } from "@/lib/scaleApi";
import { cn, fullName, personName } from "@/lib/utils";
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

export default function StudentHome() {
  const { user, profile } = useAuth();
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const { pending: edtPending, pendingCount: edtPendingCount, markSeen } =
    useEdtPendingChanges();
  const name = personName(profile?.first_name, profile?.last_name);

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
        recentNotes: notes.slice(0, 4).map((n) => ({
          id: n.id,
          score: n.score,
          max_score: n.max_score,
          period_label: n.period_label,
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

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDow = dbDayOfWeek();

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

  if (isLoading) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  if (!data) {
    return (
      <p className="text-slate-500">Impossible de charger votre aperçu.</p>
    );
  }

  const classLabel = [
    data.className ?? "Sans classe",
    data.gradeLevel,
  ]
    .filter(Boolean)
    .join(" · ");

  const pendingExercices = data.pendingExercices ?? [];
  const upcomingExamens = data.upcomingExamens ?? [];
  const upcomingCompositions = data.upcomingCompositions ?? [];
  const recentNotes = data.recentNotes ?? [];
  const todaySlots = data.todaySlots ?? [];
  const announcements = data.announcements ?? [];
  const recentMessages = data.recentMessages ?? [];
  const annual = data.annual;
  const toPrepare =
    (data.pendingExercices ?? []).length +
    (data.upcomingExamens ?? []).length +
    (data.upcomingCompositions ?? []).length;
  const trimesterShort = ["Trimestre 1", "Trimestre 2", "Trimestre 3"] as const;

  return (
    // squarer corners on this page only: the shared home components keep their radius elsewhere
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Welcome banner: greeting, three key figures, and the next class */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                {formatDateSafe(now.toISOString(), "EEEE d MMMM", { locale: fr })}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">
                {now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir"}
                {profile?.first_name?.trim() ? `, ${profile.first_name.trim()}` : name ? `, ${name}` : ""} 👋
              </h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-white/85">
                <GraduationCap className="h-4 w-4" />
                {classLabel}
              </p>
              {unreadInbox.discussions + unreadInbox.announcements > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {unreadInbox.discussions > 0 ? (
                    <Link
                      to="/messages"
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/20 transition hover:bg-white/25"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {unreadInbox.discussions} message{unreadInbox.discussions > 1 ? "s" : ""} non lu
                      {unreadInbox.discussions > 1 ? "s" : ""}
                    </Link>
                  ) : null}
                  {unreadInbox.announcements > 0 ? (
                    <Link
                      to="/annonces"
                      className="inline-flex items-center gap-1.5 rounded-md bg-faso-yellow/25 px-3 py-1.5 text-xs font-semibold ring-1 ring-faso-yellow/40 transition hover:bg-faso-yellow/35"
                    >
                      <Bell className="h-3.5 w-3.5" />
                      {unreadInbox.announcements} annonce{unreadInbox.announcements > 1 ? "s" : ""}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat
                to="/mon-bulletin"
                label="Moyenne"
                value={annual?.annualAverage != null ? formatAverage(annual.annualAverage, 1) : "—"}
                hint={
                  annual?.annualAverage != null
                    ? `${formatPassDecision(annual)}${!annual.complete ? " · provisoire" : ""}`
                    : "Pas de notes"
                }
              />
              <BannerStat
                to="/mes-presences"
                label="Présence"
                value={data.attendanceRate != null ? `${data.attendanceRate}%` : "—"}
                hint={
                  data.attendanceRate != null
                    ? `${data.absencesCount} absence${data.absencesCount > 1 ? "s" : ""}`
                    : "Aucune saisie"
                }
              />
              <BannerStat
                to="/mes-exercices"
                label="À préparer"
                value={String(toPrepare)}
                hint={toPrepare > 0 ? "à venir" : "Rien à rendre"}
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <NextClassCard focus={scheduleFocus} nowMinutes={nowMinutes} />
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
                {edtPending[0]?.label
                  ? ` · ${edtPending[0].label}`
                  : ""}
                {edtPendingCount > 1 ? "…" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Link to="/mon-emploi-du-temps">
              <Button size="sm">Voir l’emploi du temps</Button>
            </Link>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => markSeen()}
            >
              Marquer comme vu
            </Button>
          </div>
        </div>
      ) : null}


      {/* Bulletin snapshot */}
      <section>
        <Panel
          icon={FileText}
          title="Bulletin · moyennes"
          subtitle="Trimestres et moyenne annuelle"
          action={
            <Link to="/mon-bulletin" className="block">
              <Button className="w-full">Voir mon bulletin</Button>
            </Link>
          }
        >
          <div className="grid gap-2 sm:grid-cols-4">
            {TRIMESTER_PERIODS.map((period, i) => {
              const t = annual?.trimesters?.[i];
              const value = t?.generalAverage ?? null;
              return (
                <div
                  key={period}
                  className="rounded-xl bg-slate-50 px-3 py-3 text-center dark:bg-[var(--surface-2)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {trimesterShort[i]}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xl font-bold tabular-nums",
                      value == null
                        ? "text-slate-400"
                        : value >= 10
                          ? "text-brand-700"
                          : "text-amber-600",
                    )}
                  >
                    {formatAverage(value, 1)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">/ 20</p>
                </div>
              );
            })}
            <div className="rounded-xl bg-brand-50 px-3 py-3 text-center ring-1 ring-brand-100 dark:bg-brand-950/40 dark:ring-brand-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                Année
              </p>
              <p
                className={cn(
                  "mt-1 text-xl font-bold tabular-nums",
                  annual?.annualAverage == null
                    ? "text-slate-400"
                    : annual.annualAverage >= 10
                      ? "text-brand-700"
                      : "text-amber-600",
                )}
              >
                {formatAverage(annual?.annualAverage ?? null, 1)}
              </p>
              <p className="mt-0.5 text-[11px] text-brand-600/80 dark:text-brand-300/80">
                {annual?.annualAverage != null
                  ? formatPassDecision(annual)
                  : "/ 20"}
              </p>
            </div>
          </div>
        </Panel>
      </section>

      {/* Academic row */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={TrendingUp}
          title="Dernières notes"
          subtitle="Tes résultats les plus récents"
          action={
            <Link to="/mes-notes" className="block">
              <Button className="w-full">Voir toutes les notes</Button>
            </Link>
          }
        >
          {recentNotes.length === 0 ? (
            <PanelEmpty message="Aucune note disponible pour le moment." />
          ) : (
            <ul className="space-y-2">
              {recentNotes.map((n) => {
                const v = on20(n.score, n.max_score);
                return (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {n.matieres?.name ?? "Matière"}
                      </p>
                      <p className="text-xs text-slate-500">{n.period_label}</p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-brand-700">
                      {v != null ? v.toFixed(1) : "—"}
                      <span className="text-xs font-medium text-slate-400">
                        {" "}
                        / 20
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          icon={Calendar}
          title={`Aujourd’hui · ${data.todayLabel}`}
          subtitle={
            scheduleFocus?.kind === "current"
              ? "Cours en cours mis en avant"
              : scheduleFocus?.isLaterDay
                ? `Pas de cours aujourd’hui · prochain : ${scheduleFocus.dayLabel}`
                : scheduleFocus?.kind === "next"
                  ? "Prochain cours mis en avant"
                  : "Tes cours du jour"
          }
          action={
            <Link to="/mon-emploi-du-temps" className="block">
              <Button className="w-full">Emploi du temps</Button>
            </Link>
          }
        >
          {todaySlots.length === 0 && !scheduleFocus ? (
            <PanelEmpty message="Pas de cours prévu cette semaine." />
          ) : (
            <div className="space-y-3">
              {todaySlots.length === 0 && scheduleFocus?.isLaterDay ? (
                <p className="text-xs font-medium text-slate-500">
                  Aucun cours aujourd’hui — voici le prochain.
                </p>
              ) : null}

              {todaySlots.length > 0 ? (
                // timeline: ✓ on a mint circle for finished classes (mint line),
                // filled green for the class in progress, hollow circle for upcoming ones
                <ol className="relative">
                  {[...todaySlots]
                    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
                    .map((s, i, list) => {
                      const start = timeToMinutes(s.start_time);
                      const end = timeToMinutes(s.end_time);
                      const done = end <= nowMinutes;
                      const current = start <= nowMinutes && nowMinutes < end;
                      const last = i === list.length - 1;
                      return (
                        <li key={s.id} className="relative flex gap-4 pb-5 last:pb-0">
                          {!last ? (
                            <span
                              aria-hidden
                              className={cn(
                                "absolute left-[11px] top-7 bottom-0 w-0.5",
                                done ? "bg-emerald-200 dark:bg-emerald-800" : "bg-slate-200 dark:bg-white/10",
                              )}
                            />
                          ) : null}
                          <span
                            aria-hidden
                            className={cn(
                              "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                              done
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                                : current
                                  ? "bg-emerald-500 text-white ring-4 ring-emerald-100 dark:ring-emerald-500/20"
                                  : "border-2 border-slate-300 bg-white dark:border-white/20",
                            )}
                          >
                            {done ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : current ? (
                              <span className="h-2 w-2 rounded-full bg-white" />
                            ) : null}
                          </span>
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={cn("truncate text-sm font-semibold", done ? "text-slate-400" : "text-slate-900")}>
                                {s.matieres?.name ?? "Cours"}
                                {current ? (
                                  <span className="ml-2 rounded-md bg-emerald-600 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white">
                                    En cours
                                  </span>
                                ) : null}
                              </p>
                              {s.room ? (
                                <p className={cn("text-xs", done ? "text-slate-400" : "text-slate-500")}>Salle {s.room}</p>
                              ) : null}
                            </div>
                            <span
                              className={cn(
                                "shrink-0 text-xs font-semibold tabular-nums",
                                done ? "text-slate-400" : "text-slate-600 dark:text-slate-300",
                              )}
                            >
                              {s.start_time?.slice(0, 5)}
                              {s.end_time ? `–${s.end_time.slice(0, 5)}` : ""}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              ) : null}

              {scheduleFocus?.isLaterDay ? (
                <ul className="space-y-2">
                  <li className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5 ring-1 ring-brand-200 dark:bg-brand-950/40 dark:ring-brand-700">
                    <span className="w-24 shrink-0 text-xs font-semibold tabular-nums text-brand-800">
                      {scheduleFocus.slot.start_time?.slice(0, 5)}
                      {scheduleFocus.slot.end_time
                        ? `–${scheduleFocus.slot.end_time.slice(0, 5)}`
                        : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {scheduleFocus.slot.matieres?.name ?? "Cours"}
                        </p>
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          {scheduleFocus.dayLabel}
                        </span>
                      </div>
                      {scheduleFocus.slot.room ? (
                        <p className="text-xs text-slate-500">
                          Salle {scheduleFocus.slot.room}
                        </p>
                      ) : null}
                    </div>
                  </li>
                </ul>
              ) : null}

              {todaySlots.length > 0 &&
              !scheduleFocus &&
              todaySlots.every(
                (s) => timeToMinutes(s.end_time) <= nowMinutes,
              ) ? (
                <p className="text-xs text-slate-500">
                  Journée terminée — aucun autre cours cette semaine.
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      </section>

      {/* Travaux scolaires */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel
          icon={ClipboardList}
          title="Exercices de maison"
          subtitle="À apporter / présenter en classe"
          action={
            <Link to="/mes-exercices" className="block">
              <Button className="w-full">Voir les exercices</Button>
            </Link>
          }
        >
          {pendingExercices.length === 0 ? (
            <PanelEmpty message="Aucun exercice à rendre pour le moment." />
          ) : (
            <ul className="space-y-2">
              {pendingExercices.slice(0, 4).map((d) => (
                <li
                  key={d.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-amber-50/80 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {[data.className, d.matieres?.name ?? "Matière"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-slate-500">{d.title}</p>
                  </div>
                  {d.due_date ? (
                    <span className="shrink-0 text-xs font-medium text-amber-800">
                      {formatDateSafe(d.due_date, "d MMM", { locale: fr })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={BookOpen}
          title="Prochains devoirs"
          subtitle="Confirmés par l’administration"
          action={
            <Link to="/mes-devoirs" className="block">
              <Button className="w-full">Voir les devoirs</Button>
            </Link>
          }
        >
          {upcomingExamens.length === 0 ? (
            <PanelEmpty message="Aucun devoir confirmé pour le moment." />
          ) : (
            <ul className="space-y-2">
              {upcomingExamens.map((e) => {
                const start = e.start_time?.slice(0, 5);
                const end = e.end_time?.slice(0, 5);
                const slot =
                  start && end ? `${start}–${end}` : start ? start : null;
                return (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-sky-50/80 px-3 py-2.5 dark:bg-sky-950/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {[data.className, e.matieres?.name ?? "Matière"]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[e.title, slot].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {e.due_date ? (
                      <span className="shrink-0 text-xs font-medium text-sky-800 dark:text-sky-300">
                        {formatDateSafe(e.due_date, "EEEE d MMMM yyyy", {
                          locale: fr,
                        })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          icon={BookMarked}
          title="Compositions"
          subtitle="Programme planifié par l’école"
          action={
            <Link to="/mes-compositions" className="block">
              <Button className="w-full">Voir le programme</Button>
            </Link>
          }
        >
          {upcomingCompositions.length === 0 ? (
            <PanelEmpty message="Aucune composition programmée pour le moment." />
          ) : (
            <ul className="space-y-2">
              {upcomingCompositions.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-violet-50/80 px-3 py-2.5 dark:bg-violet-950/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {c.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {c.period_label}
                      {c.paperCount > 0
                        ? ` · ${c.paperCount} épreuve${c.paperCount > 1 ? "s" : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-violet-800 dark:text-violet-300">
                    {formatDateSafe(c.starts_on, "d MMM", { locale: fr })}
                    {" – "}
                    {formatDateSafe(c.ends_on, "d MMM", { locale: fr })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Comms row */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={Bell}
          title="Annonces de l’école"
          subtitle="Infos officielles de l’administration"
          action={
            <Link to="/annonces" className="block">
              <Button className="w-full">
                <Bell className="h-4 w-4" />
                Voir les annonces
              </Button>
            </Link>
          }
        >
          {announcements.length === 0 ? (
            <PanelEmpty message="Aucune annonce pour le moment." />
          ) : (
            <ul className="space-y-2">
              {announcements.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {m.subject?.trim() || "Annonce"}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatDateSafe(m.created_at, "d/MM/yyyy")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {snippet(m.body, 110)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={MessageSquare}
          title="Messages récents"
          subtitle="Échanges avec enseignants et école"
          action={
            <Link to="/messages" className="block">
              <Button className="w-full">
                <MessageSquare className="h-4 w-4" />
                Voir tous les messages
              </Button>
            </Link>
          }
        >
          {recentMessages.length === 0 ? (
            <PanelEmpty message="Aucun message pour le moment." />
          ) : (
            <ul className="space-y-2">
              {recentMessages.map((m) => {
                const sender = m.sender
                  ? fullName(m.sender.first_name, m.sender.last_name)
                  : "Expéditeur";
                const unread = !m.read_at;
                return (
                  <li key={m.id}>
                    <Link
                      to="/messages"
                      className={cn(
                        "block rounded-xl px-3 py-2.5 transition hover:bg-brand-50/60",
                        unread ? "bg-brand-50/40 ring-1 ring-brand-100" : "bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {sender}
                          {unread ? (
                            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-brand-500 align-middle" />
                          ) : null}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {relativeFr(m.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-slate-700">
                        {m.subject?.trim() || "Sans objet"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {snippet(m.body)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <QuickLink to="/mes-notes" label="Mes notes" icon={BookOpen} />
        <QuickLink to="/mes-exercices" label="Exercices" icon={ClipboardList} />
        <QuickLink to="/mes-devoirs" label="Devoirs" icon={FileText} />
        <QuickLink
          to="/mes-compositions"
          label="Compositions"
          icon={BookMarked}
        />
        <QuickLink to="/mes-presences" label="Présences" icon={CheckCircle2} />
        <QuickLink to="/mes-profs" label="Mes profs" icon={Users} />
        <QuickLink to="/mon-bulletin" label="Mon bulletin" icon={GraduationCap} />
      </section>
    </div>
  );
}

function BannerStat({ to, label, value, hint }: { to: string; label: string; value: string; hint: string }) {
  return (
    <Link to={to} className="rounded-md bg-white/10 p-3.5 ring-1 ring-white/15 transition hover:bg-white/15">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums lg:text-[1.75rem]">{value}</p>
      <p className="mt-0.5 truncate text-xs text-white/75">{hint}</p>
    </Link>
  );
}

type NextFocus = {
  slot: { start_time: string; end_time: string; room: string | null; matieres: { name: string } | null };
  kind: "current" | "next";
  dayLabel: string;
  isLaterDay: boolean;
} | null;

function waitLabel(minutes: number) {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")}`;
}

/** White card in the banner: the class in progress (with progress bar) or the next one. */
function NextClassCard({ focus, nowMinutes }: { focus: NextFocus; nowMinutes: number }) {
  if (!focus) {
    return (
      <div className="rounded-md bg-white/10 p-5 ring-1 ring-white/15">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Maintenant</p>
        <p className="mt-2 text-lg font-semibold">Pas de cours prévu cette semaine</p>
      </div>
    );
  }
  const start = timeToMinutes(focus.slot.start_time);
  const end = timeToMinutes(focus.slot.end_time);
  const live = focus.kind === "current";
  const progress = live ? Math.min(100, Math.max(0, ((nowMinutes - start) / (end - start)) * 100)) : 0;
  const room = focus.slot.room?.trim() ? (/^salle/i.test(focus.slot.room.trim()) ? focus.slot.room.trim() : `Salle ${focus.slot.room.trim()}`) : null;
  const status = live
    ? `Se termine dans ${waitLabel(end - nowMinutes)}`
    : focus.isLaterDay
      ? `${focus.dayLabel} à ${focus.slot.start_time.slice(0, 5)}`
      : `Commence dans ${waitLabel(start - nowMinutes)}`;
  return (
    <Link
      to="/mon-emploi-du-temps"
      className="block rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25 transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
            live ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800",
          )}
        >
          {live ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {live ? "En cours" : "Prochain cours"}
        </span>
        <span className="text-xs font-semibold tabular-nums text-slate-500">
          {focus.slot.start_time.slice(0, 5)}–{focus.slot.end_time.slice(0, 5)}
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-bold text-slate-900">{focus.slot.matieres?.name ?? "Cours"}</p>
      <p className="mt-0.5 text-sm text-slate-500">{[room, status].filter(Boolean).join(" · ")}</p>
      {live ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-sm bg-slate-100">
          <div className="h-full rounded-sm bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </Link>
  );
}
