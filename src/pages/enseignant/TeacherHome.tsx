import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageSquare,
  Users,
} from "lucide-react";
import {
  Panel,
  PanelEmpty,
  PortalHomeHeader,
  type InboxPreview,
} from "@/components/PortalHomeKit";
import { relativeFr, snippet } from "@/lib/portalHomeFormat";
import {
  TeacherMobileHome,
  type MetricChipModel,
} from "@/pages/enseignant/TeacherMobileHome";
import {
  buildMobileSchedule,
  frCount,
  isSunday,
  type NowSlot,
} from "@/lib/teacherNow";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe } from "@/lib/dateFr";
import { computeScheduleFocus, dbDayOfWeek } from "@/lib/timetableSchedule";
import { Badge, Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName, personName } from "@/lib/utils";
import { getTimeGreeting } from "@/lib/greeting";

export default function TeacherHome() {
  const { user, profile, schools, schoolId } = useAuth();
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const name = personName(profile?.first_name, profile?.last_name);
  const schoolName = schools.find((s) => s.id === schoolId)?.name;

  const { data, isLoading } = useQuery({
    queryKey: ["teacher-home", "v2", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const uid = user!.id;

      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("id, class_section_id, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", uid);
      if (error) throw error;

      const assignments = (aff ?? []).map((a) => {
        const row = a as unknown as {
          id: string;
          class_section_id: string;
          classes: {
            id: string;
            name: string;
            grade_level: string | null;
          } | null;
          matieres: { name: string } | null;
        };
        return {
          id: row.id,
          classId: row.classes?.id ?? row.class_section_id,
          className: row.classes?.name ?? "Classe",
          gradeLevel: row.classes?.grade_level ?? null,
          subjectName: row.matieres?.name ?? "Matière",
        };
      });

      const byClass = new Map<
        string,
        {
          classId: string;
          className: string;
          gradeLevel: string | null;
          subjects: string[];
        }
      >();
      for (const a of assignments) {
        const existing = byClass.get(a.classId);
        if (existing) {
          if (!existing.subjects.includes(a.subjectName)) {
            existing.subjects.push(a.subjectName);
          }
        } else {
          byClass.set(a.classId, {
            classId: a.classId,
            className: a.className,
            gradeLevel: a.gradeLevel,
            subjects: [a.subjectName],
          });
        }
      }
      const classes = [...byClass.values()].map((c) => ({
        ...c,
        subjects: [...c.subjects].sort((x, y) =>
          x.localeCompare(y, "fr", { sensitivity: "base" }),
        ),
      }));

      const uniqueClassIds = classes.map((c) => c.classId);
      const today = format(new Date(), "yyyy-MM-dd");

      let studentsCount = 0;
      const studentCountByClass = new Map<string, number>();
      if (uniqueClassIds.length > 0) {
        const { data: insc } = await supabase
          .from("inscriptions")
          .select("class_section_id")
          .in("class_section_id", uniqueClassIds)
          .eq("status", "active");
        for (const row of insc ?? []) {
          const id = (row as { class_section_id: string }).class_section_id;
          studentCountByClass.set(id, (studentCountByClass.get(id) ?? 0) + 1);
        }
        studentsCount = [...studentCountByClass.values()].reduce(
          (a, b) => a + b,
          0,
        );
      }

      type StatusCounts = {
        present: number;
        absent: number;
        late: number;
        excused: number;
        total: number;
      };
      const byStatus = new Map<string, StatusCounts>();
      const recordedBySubject: Record<string, number> = {};
      if (uniqueClassIds.length > 0) {
        const { data: pres } = await supabase
          .from("presences")
          .select("class_section_id, subject_id, status")
          .in("class_section_id", uniqueClassIds)
          .eq("date", today);
        for (const row of pres ?? []) {
          const r = row as {
            class_section_id: string;
            subject_id: string | null;
            status: "present" | "absent" | "late" | "excused";
          };
          const cur = byStatus.get(r.class_section_id) ?? {
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            total: 0,
          };
          cur[r.status] += 1;
          cur.total += 1;
          byStatus.set(r.class_section_id, cur);
          if (r.subject_id) {
            const key = `${r.class_section_id}:${r.subject_id}`;
            recordedBySubject[key] = (recordedBySubject[key] ?? 0) + 1;
          }
        }
      }

      const attendanceToday = classes.map((c) => {
        const studentCount = studentCountByClass.get(c.classId) ?? 0;
        const st = byStatus.get(c.classId);
        const recorded = st?.total ?? 0;
        const status: "done" | "partial" | "todo" =
          studentCount > 0 && recorded >= studentCount
            ? "done"
            : recorded > 0
              ? "partial"
              : "todo";
        return {
          classId: c.classId,
          className: c.className,
          studentCount,
          recorded,
          present: st?.present ?? 0,
          absent: st?.absent ?? 0,
          late: st?.late ?? 0,
          excused: st?.excused ?? 0,
          status,
        };
      });

      const attendancePending = attendanceToday.filter(
        (c) => c.status !== "done" && c.studentCount > 0,
      ).length;
      const attendanceDone = attendanceToday.filter(
        (c) => c.status === "done",
      ).length;

      const { count: exercicesCount } = await supabase
        .from("evaluations")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", uid)
        .eq("type", "devoir");

      const { count: examensCount } = await supabase
        .from("evaluations")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", uid)
        .eq("type", "examen");

      const { data: recentDevoirs } = await supabase
        .from("evaluations")
        .select(
          "id, title, due_date:eval_date, classes(name), matieres(name)",
        )
        .eq("teacher_id", uid)
        .eq("type", "devoir")
        .order("created_at", { ascending: false })
        .limit(4);

      const { data: upcomingExamens } = await supabase
        .from("evaluations")
        .select(
          "id, title, due_date:eval_date, start_time, end_time, admin_confirmed, classes(name), matieres(name)",
        )
        .eq("teacher_id", uid)
        .eq("type", "examen")
        .gte("eval_date", today)
        .order("eval_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(6);

      const { data: msgData } = await supabase
        .from("messages")
        .select(
          "id, subject, body, created_at, read_at, is_announcement, sender:profils!messages_sender_id_fkey(first_name, last_name)",
        )
        .eq("recipient_id", uid)
        .order("created_at", { ascending: false })
        .limit(30);

      const allMsgs = (msgData ?? []) as unknown as InboxPreview[];

      return {
        classes,
        assignmentCount: assignments.length,
        uniqueClasses: uniqueClassIds.length,
        studentsCount,
        exercicesCount: exercicesCount ?? 0,
        examensCount: examensCount ?? 0,
        attendanceToday,
        attendancePending,
        attendanceDone,
        studentCountByClass: Object.fromEntries(studentCountByClass),
        recordedBySubject,
        today,
        recentDevoirs: (recentDevoirs ?? []) as unknown as {
          id: string;
          title: string;
          due_date: string | null;
          classes: { name: string } | null;
          matieres: { name: string } | null;
        }[],
        upcomingExamens: (upcomingExamens ?? []) as unknown as {
          id: string;
          title: string;
          due_date: string | null;
          start_time: string | null;
          end_time: string | null;
          admin_confirmed: boolean;
          classes: { name: string } | null;
          matieres: { name: string } | null;
        }[],
        announcements: allMsgs.filter((m) => m.is_announcement).slice(0, 3),
        recentMessages: allMsgs.filter((m) => !m.is_announcement).slice(0, 3),
      };
    },
  });

  // Fetch EDT in parallel query to keep home load snappy
  const {
    data: weekSlots = [],
    isLoading: edtLoading,
    isError: edtError,
  } = useQuery({
    queryKey: ["teacher-home-edt", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select(
          "id, day_of_week, start_time, end_time, room, class_section_id, subject_id, matieres(name), classes(name)",
        )
        .eq("teacher_id", user!.id)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
        room: string | null;
        class_section_id: string | null;
        subject_id: string | null;
        matieres: { name: string } | null;
        classes: { name: string } | null;
      }[];
    },
  });

  const todayDow = dbDayOfWeek();
  const todaySlots = useMemo(
    () => weekSlots.filter((s) => s.day_of_week === todayDow),
    [weekSlots, todayDow],
  );
  const scheduleFocus = useMemo(
    () => computeScheduleFocus(weekSlots),
    [weekSlots],
  );

  const mobileSchedule = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const sunday = isSunday(now);
    const slots: NowSlot[] = sunday
      ? []
      : todaySlots.map((slot) => ({
          id: slot.id,
          start_time: slot.start_time,
          end_time: slot.end_time,
          room: slot.room,
          classId: slot.class_section_id,
          subjectId: slot.subject_id,
          subjectName: slot.matieres?.name ?? null,
          className: slot.classes?.name ?? null,
        }));
    return buildMobileSchedule({
      isSunday: sunday,
      weekCount: weekSlots.length,
      todaySlots: slots,
      now,
      studentCountByClass: data.studentCountByClass,
      recordedBySubject: data.recordedBySubject,
      recordedByClass: Object.fromEntries(
        data.attendanceToday.map((row) => [row.classId, row.recorded]),
      ),
      nextDayLabel:
        !sunday && scheduleFocus?.isLaterDay ? scheduleFocus.dayLabel : null,
    });
  }, [data, todaySlots, weekSlots.length, scheduleFocus]);

  const metricChips = useMemo((): MetricChipModel[] => {
    if (!data) return [];
    const unread = unreadInbox.discussions;
    const pending = data.attendancePending;
    const appel =
      pending > 0
        ? {
            value: String(pending),
            label: `${pending === 1 ? "appel" : "appels"} à faire`,
            valueClass: "text-amber-800 dark:text-amber-200",
            ariaLabel: `${frCount(pending, "appel", "appels")} à faire aujourd’hui`,
          }
        : {
            value: String(data.attendanceDone),
            label:
              data.uniqueClasses === 0
                ? "appels"
                : data.attendanceDone === 1
                  ? "appel fait"
                  : "appels faits",
            valueClass: "text-emerald-800 dark:text-emerald-200",
            ariaLabel:
              data.uniqueClasses === 0
                ? "Aucune classe"
                : `${frCount(data.attendanceDone, "appel fait", "appels faits")} aujourd’hui`,
          };
    return [
      {
        key: "appels",
        to: "/presences",
        ...appel,
      },
      {
        key: "messages",
        to: "/messages",
        value: String(unread),
        label: unread === 1 ? "non lu" : "non lus",
        valueClass:
          unread > 0
            ? "text-rose-800 dark:text-rose-200"
            : "text-slate-600 dark:text-slate-300",
        ariaLabel: frCount(unread, "message non lu", "messages non lus"),
      },
      {
        key: "exercices",
        to: "/devoirs",
        value: String(data.exercicesCount),
        label: data.exercicesCount === 1 ? "exercice" : "exercices",
        valueClass: "text-amber-800 dark:text-amber-200",
        ariaLabel: frCount(
          data.exercicesCount,
          "exercice de maison",
          "exercices de maison",
        ),
      },
      {
        key: "devoirs",
        to: "/devoirs",
        value: String(data.examensCount),
        label: data.examensCount === 1 ? "devoir" : "devoirs",
        valueClass: "text-violet-800 dark:text-violet-200",
        ariaLabel: frCount(
          data.examensCount,
          "devoir surveillé",
          "devoirs surveillés",
        ),
      },
      {
        key: "classes",
        to: "/mes-classes",
        value: String(data.uniqueClasses),
        label: data.uniqueClasses === 1 ? "classe" : "classes",
        valueClass: "text-brand-800 dark:text-brand-200",
        ariaLabel: `${frCount(data.uniqueClasses, "classe", "classes")}, ${frCount(data.assignmentCount, "affectation", "affectations")}`,
      },
      {
        key: "eleves",
        to: "/mes-eleves",
        value: String(data.studentsCount),
        label: data.studentsCount === 1 ? "élève" : "élèves",
        valueClass: "text-sky-800 dark:text-sky-200",
        ariaLabel: `${frCount(data.studentsCount, "élève", "élèves")} dans vos classes`,
      },
    ];
  }, [data, unreadInbox.discussions]);

  if (isLoading || !data) {
    if (!isLoading) {
      return (
        <p className="text-slate-500">Impossible de charger votre aperçu.</p>
      );
    }
    return (
      <div className="space-y-6" aria-busy="true">
        <p className="sr-only">Chargement de l’accueil…</p>
        <PortalHomeHeader
          icon={BookOpen}
          name={name}
          context={[schoolName, "Enseignant"].filter(Boolean).join(" · ")}
          unreadInbox={unreadInbox}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />
          <div className="hidden h-48 animate-pulse rounded-2xl bg-slate-200 md:block dark:bg-slate-700" />
        </div>
        <div className="flex gap-2 overflow-hidden md:hidden">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-11 w-28 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"
            />
          ))}
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700"
            />
          ))}
        </div>
      </div>
    );
  }

  const timetableClassIds = new Set<string>();
  if (mobileSchedule?.featured?.slot.classId) {
    timetableClassIds.add(mobileSchedule.featured.slot.classId);
  }
  for (const row of mobileSchedule?.rest ?? []) {
    if (row.slot.classId) timetableClassIds.add(row.slot.classId);
  }
  // Counts for classes already listed in Maintenant / Ensuite stay out of this panel
  // until an appel has actually been recorded.
  const presenceRows = data.attendanceToday.filter(
    (row) => row.recorded > 0 || !timetableClassIds.has(row.classId),
  );

  const appelsTotal = data.attendancePending + data.attendanceDone;
  const appelsPct = appelsTotal ? Math.round((data.attendanceDone / appelsTotal) * 100) : 0;

  return (
    // squarer corners on this page only
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Banner: same teal gradient and effects as the student and parent portals */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                {getTimeGreeting()}
                {schoolName ? ` · ${schoolName}` : ""}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">{name || "—"}</h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                Enseignant · {data.uniqueClasses} classe{data.uniqueClasses > 1 ? "s" : ""} ·{" "}
                {data.assignmentCount} affectation{data.assignmentCount > 1 ? "s" : ""}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat to="/mes-classes" label="Classes" value={String(data.uniqueClasses)} hint="voir mes classes" />
              <BannerStat to="/mes-eleves" label="Élèves" value={String(data.studentsCount)} hint="dans vos classes" />
              <BannerStat
                to="/messages"
                label="Messages"
                value={String(unreadInbox.discussions)}
                hint={unreadInbox.discussions ? (unreadInbox.discussions > 1 ? "non lus" : "non lu") : "tout est lu"}
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
                  <CheckCircle2 className="h-3 w-3" />
                  Appels du jour
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {formatDateSafe(data.today, "EEEE d MMMM", { locale: fr })}
                </span>
              </div>
              {appelsTotal === 0 ? (
                <p className="mt-3 text-lg font-bold text-slate-900">Pas d’appel prévu aujourd’hui</p>
              ) : (
                <>
                  <p className="mt-3 text-xl font-bold text-slate-900">
                    {data.attendancePending > 0
                      ? `${data.attendancePending} appel${data.attendancePending > 1 ? "s" : ""} à faire`
                      : "Tous les appels sont faits"}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-100">
                    <div
                      className={cn("h-full rounded-sm", data.attendancePending ? "bg-brand-600" : "bg-emerald-500")}
                      style={{ width: `${appelsPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {data.attendanceDone} sur {appelsTotal} classe{appelsTotal > 1 ? "s" : ""}
                  </p>
                </>
              )}
              <Link
                to="/presences"
                className="mt-4 flex h-10 items-center justify-center rounded-md bg-brand-700 text-sm font-semibold !text-white transition hover:bg-brand-800"
              >
                {data.attendancePending > 0 ? "Faire l’appel" : "Voir les présences"}
              </Link>
            </div>
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      <TeacherMobileHome
        schedule={mobileSchedule}
        chips={metricChips}
        todayIso={data.today}
        edtLoading={edtLoading}
        edtError={edtError}
      />

      {/* Présences : effectifs, sans répéter l’état d’appel déjà porté par Maintenant / Ensuite. */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            icon={CheckCircle2}
            title="Présences du jour"
            subtitle={formatDateSafe(data.today, "EEEE d MMMM", { locale: fr })}
            action={
              <Link to="/presences" className="block">
                <Button className="w-full">
                  <ClipboardList className="h-4 w-4" />
                  Détail des présences
                </Button>
              </Link>
            }
          >
            {presenceRows.length === 0 ? (
              <PanelEmpty message="Les appels du jour sont dans « Maintenant » et « Ensuite aujourd’hui »." />
            ) : (
              <ul className="space-y-2">
                {presenceRows.slice(0, 6).map((c) => (
                  <li key={c.classId}>
                    <Link
                      to={`/classes/${c.classId}/presences`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:hover:border-brand-700 dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {c.className}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {c.recorded === 0
                            ? `${c.studentCount} élève${c.studentCount === 1 ? "" : "s"} · pas encore d’appel`
                            : `${c.present} présent${c.present === 1 ? "" : "s"} · ${c.absent} absent${c.absent === 1 ? "" : "s"}${
                                c.late > 0
                                  ? ` · ${c.late} retard${c.late === 1 ? "" : "s"}`
                                  : ""
                              }`}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          icon={FileText}
          title="Prochains devoirs"
          subtitle="Vos dates à venir"
          action={
            <Link to="/devoirs" className="block">
              <Button className="w-full">Gérer les devoirs</Button>
            </Link>
          }
        >
          {data.upcomingExamens.length === 0 ? (
            <PanelEmpty message="Aucun devoir à venir." />
          ) : (
            <ul className="space-y-2">
              {data.upcomingExamens.map((e, index) => {
                const slot = formatExamSchedule(e);
                const isNext = index === 0;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "rounded-xl px-3 py-2.5",
                      isNext
                        ? "bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-700"
                        : "bg-slate-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {e.title}
                      </p>
                      {isNext ? (
                        <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Prochain
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[e.classes?.name, e.matieres?.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {e.due_date ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isNext
                              ? "text-violet-800 dark:text-violet-200"
                              : "text-slate-600",
                          )}
                        >
                          {formatDateSafe(e.due_date, "EEEE d MMMM yyyy", {
                            locale: fr,
                          })}
                          {slot ? ` · ${slot}` : ""}
                        </span>
                      ) : null}
                      <Badge
                        tone={e.admin_confirmed ? "success" : "warning"}
                      >
                        {e.admin_confirmed ? "Confirmé" : "En attente"}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      {/* Asymmetric: classes narrow + exercices wide */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel
          icon={Users}
          title="Mes classes"
          subtitle="Classes et matières assignées"
          action={
            <Link to="/mes-classes" className="block">
              <Button className="w-full">Voir mes classes</Button>
            </Link>
          }
        >
          {data.classes.length === 0 ? (
            <PanelEmpty message="Aucune affectation pour le moment." />
          ) : (
            <ul className="space-y-2">
              {data.classes.slice(0, 6).map((c) => (
                <li key={c.classId}>
                  <Link
                    to={`/classes/${c.classId}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-300 hover:bg-slate-50 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:hover:border-brand-700 dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {c.className}
                        {c.gradeLevel ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            {c.gradeLevel}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-slate-500">
                        {c.subjects.join(" · ")}
                      </p>
                    </div>
                    <span className="mt-0.5 shrink-0 text-xs font-medium text-brand-700">
                      Ouvrir →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="lg:col-span-2">
          <Panel
            icon={ClipboardList}
            title="Derniers exercices"
            subtitle="Travaux de maison récents"
            action={
              <Link to="/devoirs" className="block">
                <Button className="w-full">Voir les exercices</Button>
              </Link>
            }
          >
            {data.recentDevoirs.length === 0 ? (
              <PanelEmpty message="Aucun exercice de maison pour le moment." />
            ) : (
              <ul className="space-y-2">
                {data.recentDevoirs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {d.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[d.classes?.name, d.matieres?.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {d.due_date ? (
                      <span className="shrink-0 text-xs font-medium text-amber-800">
                        {formatDateSafe(d.due_date, "d MMMM yyyy", {
                          locale: fr,
                        })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Panel
            icon={Bell}
            title="Annonces de l’école"
            subtitle="Infos officielles"
            action={
              <Link to="/annonces" className="block">
                <Button className="w-full">
                  <Bell className="h-4 w-4" />
                  Voir les annonces
                </Button>
              </Link>
            }
          >
            {data.announcements.length === 0 ? (
              <PanelEmpty message="Aucune annonce pour le moment." />
            ) : (
              <ul className="space-y-2">
                {data.announcements.map((m) => (
                  <li key={m.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
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
        </div>

        <div className="lg:col-span-2">
          <Panel
            icon={MessageSquare}
            title="Messages récents"
            subtitle="Parents, admin et collègues"
            action={
              <Link to="/messages" className="block">
                <Button className="w-full">
                  <MessageSquare className="h-4 w-4" />
                  Voir tous les messages
                </Button>
              </Link>
            }
          >
            {data.recentMessages.length === 0 ? (
              <PanelEmpty message="Aucun message pour le moment." />
            ) : (
              <ul className="space-y-2">
                {data.recentMessages.map((m) => {
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
                          unread
                            ? "bg-brand-50/40 ring-1 ring-brand-100"
                            : "bg-slate-50",
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
        </div>
      </section>
    </div>
  );
}

function BannerStat({ label, value, hint, to }: { label: string; value: string; hint: string; to: string }) {
  return (
    <Link to={to} className="block rounded-md bg-white/10 p-3.5 ring-1 ring-white/15 transition hover:bg-white/15">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider !text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums !text-white lg:text-[1.75rem]">{value}</p>
      <p className="mt-0.5 truncate text-xs !text-white/80">{hint}</p>
    </Link>
  );
}
