import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bell,
  Calendar,
  CheckCircle2,
  FileText,
  GraduationCap,
  MessageSquare,
  School,
  Settings,
  Users,
} from "lucide-react";
import {
  MetricCard,
  Panel,
  PanelEmpty,
  PortalHomeHeader,
  relativeFr,
  snippet,
  type InboxPreview,
} from "@/components/PortalHomeKit";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { formatDateSafe } from "@/lib/dateFr";
import { fetchEnrollmentsByStudent } from "@/lib/programmeCounts";
import { Badge, Button, EmptyState } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { usePendingExamsCount } from "@/hooks/usePendingExamsCount";
import { useStudentsWithoutClassCount } from "@/hooks/useStudentsWithoutClassCount";
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName, joinProfile, personName } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import type { AttendanceStatus } from "@/lib/types";

function dbDayOfWeek(date = new Date()) {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

type PresenceAlert = {
  id: string;
  status: AttendanceStatus;
  studentName: string;
  className: string;
  subjectName: string | null;
};

type ExamPreview = {
  id: string;
  title: string;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  admin_confirmed: boolean;
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
};

type StudentPreview = {
  id: string;
  name: string;
};

export default function EcoleOverview() {
  const { schoolId, schools, user, profile } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const { data: sansClasse = 0 } = useStudentsWithoutClassCount();
  const { data: pendingExams = 0 } = usePendingExamsCount();
  const name = personName(profile?.first_name, profile?.last_name);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ecole-home", "v2", schoolId, user?.id],
    enabled: !!schoolId && !!user?.id,
    queryFn: async () => {
      const sid = schoolId!;
      const uid = user!.id;
      const today = format(new Date(), "yyyy-MM-dd");
      const todayDow = dbDayOfWeek();

      const [
        classesRes,
        students,
        teachers,
        subjects,
        yearRes,
        msgRes,
        classesListRes,
      ] = await Promise.all([
        supabase
          .from("classes")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid)
          .eq("role", "student"),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid)
          .eq("role", "teacher"),
        supabase
          .from("matieres")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid),
        supabase
          .from("annees_scolaires")
          .select("label")
          .eq("school_id", sid)
          .eq("is_current", true)
          .maybeSingle(),
        supabase
          .from("messages")
          .select(
            "id, subject, body, created_at, read_at, is_announcement, sender:profils!messages_sender_id_fkey(first_name, last_name)",
          )
          .eq("recipient_id", uid)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("classes")
          .select("id, name")
          .eq("school_id", sid)
          .order("name"),
      ]);

      const classRows = (classesListRes.data ?? []) as {
        id: string;
        name: string;
      }[];
      const classIds = classRows.map((c) => c.id);
      const classNameById = new Map(classRows.map((c) => [c.id, c.name]));

      let presenceAlerts: PresenceAlert[] = [];
      let presenceAbsent = 0;
      let presenceLate = 0;
      let presenceExcused = 0;
      let pendingExamList: ExamPreview[] = [];
      let upcomingExamList: ExamPreview[] = [];
      let studentsWithoutClass: StudentPreview[] = [];
      let classesWithEdt = 0;
      let todaySlotCount = 0;
      let classesWithoutEdt: { id: string; name: string }[] = [];

      if (classIds.length > 0) {
        const { data: presenceRows } = await supabase
          .from("presences")
          .select(
            "id, status, student_id, class_section_id, matieres(name), profils:profils!presences_student_id_fkey(first_name, last_name)",
          )
          .eq("date", today)
          .in("class_section_id", classIds)
          .in("status", ["absent", "late", "excused"])
          .limit(40);

        type PresenceRow = {
          id: string;
          status: AttendanceStatus;
          class_section_id: string;
          matieres: { name: string } | null;
          profils: { first_name: string; last_name: string } | null;
        };

        const alerts = ((presenceRows ?? []) as PresenceRow[]).map((p) => {
          const profil = joinProfile(p.profils);
          return {
            id: p.id,
            status: p.status,
            studentName: personName(profil?.first_name, profil?.last_name),
            className: classNameById.get(p.class_section_id) ?? "Classe",
            subjectName: p.matieres?.name ?? null,
          };
        });

        presenceAlerts = alerts.slice(0, 6);
        presenceAbsent = alerts.filter((a) => a.status === "absent").length;
        presenceLate = alerts.filter((a) => a.status === "late").length;
        presenceExcused = alerts.filter((a) => a.status === "excused").length;

        const { data: examRows } = await supabase
          .from("evaluations")
          .select(
            "id, title, due_date:eval_date, start_time, end_time, admin_confirmed, classes(name), matieres(name), teacher:profils!evaluations_teacher_id_fkey(first_name, last_name)",
          )
          .eq("type", "examen")
          .in("class_section_id", classIds)
          .order("eval_date", { ascending: true, nullsFirst: false })
          .limit(40);

        type ExamRow = {
          id: string;
          title: string;
          due_date: string | null;
          start_time: string | null;
          end_time: string | null;
          admin_confirmed: boolean;
          classes: { name: string } | null;
          matieres: { name: string } | null;
          teacher: { first_name: string; last_name: string } | null;
        };

        const exams = ((examRows ?? []) as ExamRow[]).map((e) => ({
          id: e.id,
          title: e.title,
          due_date: e.due_date,
          start_time: e.start_time,
          end_time: e.end_time,
          admin_confirmed: e.admin_confirmed,
          className: e.classes?.name ?? null,
          subjectName: e.matieres?.name ?? null,
          teacherName: e.teacher
            ? fullName(e.teacher.first_name, e.teacher.last_name)
            : null,
        }));

        pendingExamList = exams
          .filter((e) => !e.admin_confirmed)
          .slice(0, 4);
        upcomingExamList = exams
          .filter(
            (e) =>
              e.admin_confirmed && (!e.due_date || e.due_date >= today),
          )
          .slice(0, 4);

        const { data: slotRows } = await supabase
          .from("creneaux_edt")
          .select("id, class_section_id, day_of_week")
          .in("class_section_id", classIds);

        const slotsByClass = new Map<string, number>();
        let todayCount = 0;
        for (const row of slotRows ?? []) {
          const cid = row.class_section_id as string;
          slotsByClass.set(cid, (slotsByClass.get(cid) ?? 0) + 1);
          if (Number(row.day_of_week) === todayDow) todayCount += 1;
        }
        todaySlotCount = todayCount;
        classesWithEdt = classRows.filter((c) => (slotsByClass.get(c.id) ?? 0) > 0)
          .length;
        classesWithoutEdt = classRows
          .filter((c) => (slotsByClass.get(c.id) ?? 0) === 0)
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name }));
      }

      const { data: studentRoles } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(first_name, last_name)")
        .eq("school_id", sid)
        .eq("role", "student")
        .eq("active", true)
        .limit(500);

      const enrolled = await fetchEnrollmentsByStudent(sid);
      studentsWithoutClass = (
        (studentRoles ?? []) as {
          user_id: string;
          profils: { first_name: string; last_name: string } | null;
        }[]
      )
        .filter((r) => !enrolled.has(r.user_id))
        .map((r) => {
          const profil = joinProfile(r.profils);
          return {
            id: r.user_id,
            name: personName(profil?.first_name, profil?.last_name),
          };
        })
        .filter((r) => r.name)
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .slice(0, 6);

      const allMsgs = (msgRes.data ?? []) as InboxPreview[];

      return {
        classes: classesRes.count ?? 0,
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        subjects: subjects.count ?? 0,
        yearLabel: (yearRes.data as { label?: string } | null)?.label ?? null,
        announcements: allMsgs.filter((m) => m.is_announcement).slice(0, 3),
        recentMessages: allMsgs.filter((m) => !m.is_announcement).slice(0, 3),
        today,
        presenceAlerts,
        presenceAbsent,
        presenceLate,
        presenceExcused,
        pendingExamList,
        upcomingExamList,
        studentsWithoutClass,
        classesWithEdt,
        todaySlotCount,
        classesWithoutEdt,
      };
    },
  });

  if (!schoolId) {
    return <EmptyState message="Aucune école associée à votre compte." />;
  }

  if (isLoading) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-3">
        <p className="text-slate-500">
          Impossible de charger l’aperçu
          {error instanceof Error ? ` : ${error.message}` : "."}
        </p>
        <Button type="button" size="sm" onClick={() => void refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const context = [
    school?.name,
    data.yearLabel ? `Année ${data.yearLabel}` : null,
    "Administrateur",
  ]
    .filter(Boolean)
    .join(" · ");

  const presenceTotal =
    data.presenceAbsent + data.presenceLate + data.presenceExcused;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PortalHomeHeader
          icon={School}
          name={name}
          context={context}
          unreadInbox={unreadInbox}
        />
        <div className="flex flex-wrap gap-2 lg:pt-2">
          <Link to="/ecole/parametres">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
              Paramètres
            </Button>
          </Link>
          {pendingExams > 0 ? (
            <Link to="/devoirs-ecole">
              <Button size="sm">
                <FileText className="h-4 w-4" />
                {pendingExams} devoir{pendingExams > 1 ? "s" : ""} à confirmer
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {pendingExams > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/40">
          <div>
            <p className="font-semibold text-amber-950">
              Devoirs en attente de confirmation
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {pendingExams} proposition{pendingExams > 1 ? "s" : ""} des
              enseignants à valider
            </p>
          </div>
          <Link to="/devoirs-ecole">
            <Button size="sm">Voir les devoirs</Button>
          </Link>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Classes"
          value={String(data.classes)}
          hint="Sections actives"
          valueClass="text-brand-600"
          to="/classes"
        />
        <MetricCard
          label="Élèves"
          value={String(data.students)}
          hint={
            sansClasse > 0
              ? `${sansClasse} sans classe`
              : "Comptes élèves"
          }
          valueClass={sansClasse > 0 ? "text-amber-600" : "text-sky-600"}
          to="/eleves"
        />
        <MetricCard
          label="Devoirs"
          value={String(pendingExams)}
          hint={
            pendingExams > 0
              ? "À confirmer"
              : "Aucune demande en attente"
          }
          valueClass={
            pendingExams > 0 ? "text-amber-600" : "text-emerald-600"
          }
          to="/devoirs-ecole"
        />
        <MetricCard
          label="Enseignants"
          value={String(data.teachers)}
          hint={`${data.subjects} matière(s)`}
          valueClass="text-violet-600"
          to="/enseignants"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={CheckCircle2}
          title="Présences du jour"
          subtitle={formatDateSafe(data.today, "EEEE d MMMM", { locale: fr })}
          action={
            <Link to="/presences-ecole" className="block">
              <Button className="w-full">Voir les présences</Button>
            </Link>
          }
        >
          {presenceTotal === 0 ? (
            <PanelEmpty message="Aucune absence ni retard saisi aujourd’hui." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                {data.presenceAbsent > 0 ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">
                    {data.presenceAbsent} absent
                    {data.presenceAbsent > 1 ? "s" : ""}
                  </span>
                ) : null}
                {data.presenceLate > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                    {data.presenceLate} retard
                    {data.presenceLate > 1 ? "s" : ""}
                  </span>
                ) : null}
                {data.presenceExcused > 0 ? (
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-900">
                    {data.presenceExcused} justifié
                    {data.presenceExcused > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-2">
                {data.presenceAlerts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        <PersonName name={p.studentName} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {[p.className, p.subjectName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge
                      tone={
                        p.status === "absent"
                          ? "danger"
                          : p.status === "late"
                            ? "warning"
                            : "info"
                      }
                    >
                      {ATTENDANCE_LABELS[p.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel
          icon={FileText}
          title="Devoirs"
          subtitle="À confirmer et prochainement"
          action={
            <Link to="/devoirs-ecole" className="block">
              <Button className="w-full">
                Gérer les devoirs
                {pendingExams > 0 ? (
                  <Badge tone="warning">{pendingExams}</Badge>
                ) : null}
              </Button>
            </Link>
          }
        >
          {data.pendingExamList.length === 0 &&
          data.upcomingExamList.length === 0 ? (
            <PanelEmpty message="Aucun devoir en attente ni à venir." />
          ) : (
            <div className="space-y-3">
              {data.pendingExamList.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    À confirmer
                  </p>
                  <ul className="space-y-2">
                    {data.pendingExamList.map((e) => {
                      const slot = formatExamSchedule(e);
                      return (
                        <li
                          key={e.id}
                          className="rounded-xl bg-amber-50/80 px-3 py-2.5"
                        >
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {e.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[
                              e.className,
                              e.subjectName,
                              e.due_date
                                ? formatDateSafe(e.due_date, "d MMM", {
                                    locale: fr,
                                  })
                                : null,
                              slot,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {data.upcomingExamList.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Confirmés à venir
                  </p>
                  <ul className="space-y-2">
                    {data.upcomingExamList.map((e) => {
                      const slot = formatExamSchedule(e);
                      return (
                        <li
                          key={e.id}
                          className="rounded-xl bg-sky-50/80 px-3 py-2.5 dark:bg-sky-950/30"
                        >
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {e.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[
                              e.className,
                              e.subjectName,
                              e.due_date
                                ? formatDateSafe(e.due_date, "EEEE d MMMM", {
                                    locale: fr,
                                  })
                                : null,
                              slot,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={GraduationCap}
          title="Élèves sans classe"
          subtitle="À affecter à une section"
          action={
            <Link to="/eleves" className="block">
              <Button className="w-full">
                <Users className="h-4 w-4" />
                Gérer les élèves
                {sansClasse > 0 ? (
                  <Badge tone="warning">{sansClasse}</Badge>
                ) : null}
              </Button>
            </Link>
          }
        >
          {data.studentsWithoutClass.length === 0 ? (
            <PanelEmpty message="Tous les élèves sont affectés à une classe." />
          ) : (
            <ul className="space-y-2">
              {data.studentsWithoutClass.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-amber-50/80 px-3 py-2.5"
                >
                  <p className="truncate text-sm font-semibold text-slate-900">
                    <PersonName name={s.name} />
                  </p>
                  <span className="shrink-0 text-xs font-medium text-amber-800">
                    Sans classe
                  </span>
                </li>
              ))}
              {sansClasse > data.studentsWithoutClass.length ? (
                <p className="text-xs text-slate-500">
                  +{sansClasse - data.studentsWithoutClass.length} autre
                  {sansClasse - data.studentsWithoutClass.length > 1
                    ? "s"
                    : ""}
                </p>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel
          icon={Calendar}
          title="Emplois du temps"
          subtitle="Couverture des classes"
          action={
            <Link to="/emplois-du-temps" className="block">
              <Button className="w-full">Voir les emplois du temps</Button>
            </Link>
          }
        >
          {data.classes === 0 ? (
            <PanelEmpty message="Aucune classe à planifier." />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Avec emploi du temps
                  </p>
                  <p className="mt-1 text-xl font-bold text-brand-700">
                    {data.classesWithEdt}
                    <span className="text-sm font-medium text-slate-400">
                      /{data.classes}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Créneaux aujourd’hui
                  </p>
                  <p className="mt-1 text-xl font-bold text-sky-700">
                    {data.todaySlotCount}
                  </p>
                </div>
              </div>

              {data.classesWithoutEdt.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Sans emploi du temps
                  </p>
                  <ul className="space-y-2">
                    {data.classesWithoutEdt.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl bg-amber-50/80 px-3 py-2.5 text-sm font-semibold text-slate-900"
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-emerald-700">
                  Toutes les classes ont un emploi du temps.
                </p>
              )}
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-1">
        <Panel
          icon={Bell}
          title="Annonces & messages"
          subtitle="Communications de l’école"
          action={
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to="/annonces" className="block">
                <Button variant="outline" className="w-full">
                  <Bell className="h-4 w-4" />
                  Annonces
                </Button>
              </Link>
              <Link to="/messages" className="block">
                <Button className="w-full">
                  <MessageSquare className="h-4 w-4" />
                  Messages
                  {unreadInbox.discussions > 0 ? (
                    <Badge tone="danger">{unreadInbox.discussions}</Badge>
                  ) : null}
                </Button>
              </Link>
            </div>
          }
        >
          {data.announcements.length === 0 &&
          data.recentMessages.length === 0 ? (
            <PanelEmpty message="Aucune communication récente." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Annonces
                </p>
                {data.announcements.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune annonce.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.announcements.map((m) => (
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
                          {snippet(m.body, 100)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Messages récents
                </p>
                {data.recentMessages.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun message.</p>
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
              </div>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
