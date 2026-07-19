import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import {
  Bell,
  BookOpen,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import {
  MetricCard,
  Panel,
  PanelEmpty,
  PortalHomeHeader,
  QuickLink,
  relativeFr,
  snippet,
} from "@/components/PortalHomeKit";
import { formatDateSafe } from "@/lib/dateFr";
import {
  isAttendancePositive,
  isUnjustifiedAbsence,
} from "@/lib/attendance";
import {
  computeAnnualAverage,
  formatAverage,
  formatPassDecision,
  programmeToCoefMap,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName, personName } from "@/lib/utils";
import type { AttendanceStatus, GradeRow, Subject } from "@/lib/types";

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
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { pending: edtPending, pendingCount: edtPendingCount, markSeen } =
    useEdtPendingChanges();
  const name = personName(profile?.first_name, profile?.last_name);

  const { data, isLoading } = useQuery({
    queryKey: ["student-home", "v4", user?.id],
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
          "id, score, max_score, period_label, subject_id, created_at, is_absent, matieres(id, name, coefficient)",
        )
        .eq("student_id", uid)
        .order("created_at", { ascending: false });

      const { count: notesCountExact } = await supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("student_id", uid);

      const notes = (notesData ?? []) as (GradeRow & {
        matieres: Subject | null;
      })[];

      let coefMap: Record<string, number> = {};
      if (classId) {
        const { data: programme } = await supabase
          .from("programme_classe")
          .select("subject_id, coefficient")
          .eq("class_section_id", classId);
        coefMap = programmeToCoefMap(programme ?? []);
      }

      const annual = computeAnnualAverage(notes, {
        coefficientBySubject: coefMap,
      });

      const { data: presenceData } = await supabase
        .from("presences")
        .select("status")
        .eq("student_id", uid)
        .limit(120);

      const presences = (presenceData ?? []) as { status: AttendanceStatus }[];
      const presentish = presences.filter((p) =>
        isAttendancePositive(p.status),
      ).length;
      const attendanceRate =
        presences.length > 0
          ? Math.round((presentish / presences.length) * 100)
          : null;
      const absencesCount = presences.filter((p) =>
        isUnjustifiedAbsence(p.status),
      ).length;

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
        const { data: exercicesData } = await supabase
          .from("devoirs")
          .select(
            "id, title, due_date, matieres(name), rendus_devoirs!left(id)",
          )
          .eq("class_section_id", classId)
          .eq("kind", "exercice_maison")
          .eq("rendus_devoirs.student_id", uid)
          .order("due_date", { ascending: true })
          .limit(8);

        pendingExercices = (
          (exercicesData ?? []) as {
            id: string;
            title: string;
            due_date: string | null;
            matieres: { name: string } | null;
            rendus_devoirs: { id: string }[];
          }[]
        )
          .filter((d) => (d.rendus_devoirs?.length ?? 0) === 0)
          .slice(0, 4);

        const { data: examensData } = await supabase
          .from("devoirs")
          .select(
            "id, title, due_date, start_time, end_time, admin_confirmed, matieres(name)",
          )
          .eq("class_section_id", classId)
          .eq("kind", "examen")
          .eq("admin_confirmed", true)
          .order("due_date", { ascending: true })
          .limit(6);

        const todayIso = new Date().toISOString().slice(0, 10);
        upcomingExamens = (
          (examensData ?? []) as {
            id: string;
            title: string;
            due_date: string | null;
            start_time: string | null;
            end_time: string | null;
            admin_confirmed: boolean;
            matieres: { name: string } | null;
          }[]
        )
          .filter((e) => !e.due_date || e.due_date >= todayIso)
          .slice(0, 4);

        const todayDow = dbDayOfWeek();
        const { data: slots } = await supabase
          .from("creneaux_edt")
          .select("id, day_of_week, start_time, end_time, room, matieres(name)")
          .eq("class_section_id", classId)
          .order("day_of_week")
          .order("start_time");
        weekSlots = (slots ?? []) as typeof weekSlots;
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

      const allMsgs = (msgData ?? []) as Msg[];
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
  const recentNotes = data.recentNotes ?? [];
  const todaySlots = data.todaySlots ?? [];
  const announcements = data.announcements ?? [];
  const recentMessages = data.recentMessages ?? [];
  const annual = data.annual;
  const trimesterShort = ["T1", "T2", "T3"] as const;

  return (
    <div className="space-y-6">
      <PortalHomeHeader
        icon={GraduationCap}
        name={name}
        context={classLabel}
        unreadMessages={unreadMessages}
      />

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

      {/* Key metrics */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Moyenne annuelle"
          value={
            annual?.annualAverage != null
              ? formatAverage(annual.annualAverage, 1)
              : "—"
          }
          hint={
            annual?.annualAverage != null
              ? `${formatPassDecision(annual)}${
                  !annual.complete ? " · provisoire" : ""
                }`
              : "Pas encore de notes"
          }
          valueClass={
            annual?.annualAverage == null
              ? "text-slate-500 dark:text-slate-300"
              : annual.annualAverage >= 10
                ? "text-brand-600"
                : "text-amber-600"
          }
          to="/mon-bulletin"
        />
        <MetricCard
          label="Présence"
          value={
            data.attendanceRate != null ? `${data.attendanceRate}%` : "—"
          }
          hint={
            data.attendanceRate != null
              ? `${data.absencesCount} absence${data.absencesCount > 1 ? "s" : ""}`
              : "Aucune saisie encore"
          }
          valueClass={
            data.attendanceRate == null
              ? "text-slate-500 dark:text-slate-300"
              : data.attendanceRate >= 85
                ? "text-emerald-600"
                : "text-amber-600"
          }
          to="/mes-presences"
        />
        <MetricCard
          label="Notes"
          value={String(data.notesCount)}
          hint="Notes publiées"
          valueClass="text-sky-600"
          to="/mes-notes"
        />
        <MetricCard
          label="Exercices"
          value={String(pendingExercices.length)}
          hint="À rendre en classe"
          valueClass={
            pendingExercices.length > 0
              ? "text-rose-600"
              : "text-slate-500 dark:text-slate-300"
          }
          to="/mes-exercices"
        />
      </section>

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
                <ul className="space-y-2">
                  {todaySlots.slice(0, 5).map((s) => {
                    const isFocus =
                      !scheduleFocus?.isLaterDay &&
                      scheduleFocus?.slot.id === s.id;
                    const badge =
                      isFocus
                        ? scheduleFocus.kind === "current"
                          ? "En cours"
                          : "Prochain"
                        : null;
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5",
                          isFocus
                            ? "bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-950/40 dark:ring-brand-700"
                            : "bg-slate-50",
                        )}
                      >
                        <span
                          className={cn(
                            "w-24 shrink-0 text-xs font-semibold tabular-nums",
                            isFocus ? "text-brand-800" : "text-brand-700",
                          )}
                        >
                          {s.start_time?.slice(0, 5)}
                          {s.end_time ? `–${s.end_time.slice(0, 5)}` : ""}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {s.matieres?.name ?? "Cours"}
                            </p>
                            {badge ? (
                              <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                {badge}
                              </span>
                            ) : null}
                          </div>
                          {s.room ? (
                            <p className="text-xs text-slate-500">
                              Salle {s.room}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
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
      <section className="grid gap-4 lg:grid-cols-2">
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
              {pendingExercices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-amber-50/80 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {d.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {d.matieres?.name ?? "Matière"}
                    </p>
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
          title="Prochains examens"
          subtitle="Confirmés par l’administration"
          action={
            <Link to="/mes-examens" className="block">
              <Button className="w-full">Voir les examens</Button>
            </Link>
          }
        >
          {upcomingExamens.length === 0 ? (
            <PanelEmpty message="Aucun examen confirmé pour le moment." />
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
                        {e.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[e.matieres?.name ?? "Matière", slot]
                          .filter(Boolean)
                          .join(" · ")}
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
      </section>

      {/* Comms row */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={Bell}
          title="Annonces de l’école"
          subtitle="Infos officielles de l’administration"
          action={
            <Link to="/messages" className="block">
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
        <QuickLink to="/mes-examens" label="Examens" icon={GraduationCap} />
        <QuickLink to="/mes-presences" label="Présences" icon={CheckCircle2} />
        <QuickLink to="/mon-bulletin" label="Mon bulletin" icon={GraduationCap} />
      </section>
    </div>
  );
}
