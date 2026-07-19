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
  MetricCard,
  Panel,
  PanelEmpty,
  PortalHomeHeader,
  relativeFr,
  snippet,
  type InboxPreview,
} from "@/components/PortalHomeKit";
import { ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe } from "@/lib/dateFr";
import { Badge, Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName, personName } from "@/lib/utils";

export default function TeacherHome() {
  const { user, profile, schools, schoolId } = useAuth();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
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
        const row = a as {
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
      if (uniqueClassIds.length > 0) {
        const { data: pres } = await supabase
          .from("presences")
          .select("class_section_id, status")
          .in("class_section_id", uniqueClassIds)
          .eq("date", today);
        for (const row of pres ?? []) {
          const r = row as {
            class_section_id: string;
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
        .from("devoirs")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", uid)
        .eq("kind", "exercice_maison");

      const { count: examensCount } = await supabase
        .from("devoirs")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", uid)
        .eq("kind", "examen");

      const { data: recentDevoirs } = await supabase
        .from("devoirs")
        .select("id, title, due_date, kind, classes(name), matieres(name)")
        .eq("teacher_id", uid)
        .eq("kind", "exercice_maison")
        .order("created_at", { ascending: false })
        .limit(4);

      const { data: upcomingExamens } = await supabase
        .from("devoirs")
        .select(
          "id, title, due_date, start_time, end_time, admin_confirmed, classes(name), matieres(name)",
        )
        .eq("teacher_id", uid)
        .eq("kind", "examen")
        .gte("due_date", today)
        .order("due_date", { ascending: true })
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

      const allMsgs = (msgData ?? []) as InboxPreview[];

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
        today,
        recentDevoirs: (recentDevoirs ?? []) as {
          id: string;
          title: string;
          due_date: string | null;
          kind: "exercice_maison" | "examen";
          classes: { name: string } | null;
          matieres: { name: string } | null;
        }[],
        upcomingExamens: (upcomingExamens ?? []) as {
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

  if (isLoading) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  if (!data) {
    return (
      <p className="text-slate-500">Impossible de charger votre aperçu.</p>
    );
  }

  return (
    <div className="space-y-6">
      <PortalHomeHeader
        icon={BookOpen}
        name={name}
        context={[schoolName, "Enseignant"].filter(Boolean).join(" · ")}
        unreadMessages={unreadMessages}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Classes"
          value={String(data.uniqueClasses)}
          hint={`${data.assignmentCount} affectation${data.assignmentCount > 1 ? "s" : ""}`}
          valueClass="text-brand-600"
          to="/mes-classes"
        />
        <MetricCard
          label="Élèves"
          value={String(data.studentsCount)}
          hint="Dans vos classes"
          valueClass="text-sky-600"
          to="/mes-eleves"
        />
        <MetricCard
          label="Présences"
          value={
            data.attendancePending > 0
              ? String(data.attendancePending)
              : String(data.attendanceDone)
          }
          hint={
            data.attendancePending > 0
              ? `classe${data.attendancePending > 1 ? "s" : ""} à faire aujourd’hui`
              : data.uniqueClasses > 0
                ? "Appel du jour à jour"
                : "Aucune classe"
          }
          valueClass={
            data.attendancePending > 0 ? "text-amber-600" : "text-emerald-600"
          }
          to="/presences"
        />
        <MetricCard
          label="Exercices"
          value={String(data.exercicesCount)}
          hint="De maison"
          valueClass="text-amber-600"
          to="/exercices-maison"
        />
        <MetricCard
          label="Examens"
          value={String(data.examensCount)}
          hint="Créés au total"
          valueClass="text-violet-600"
          to="/examens"
        />
        <MetricCard
          label="Messages"
          value={String(unreadMessages)}
          hint="Non lus"
          valueClass={unreadMessages > 0 ? "text-rose-600" : "text-slate-500 dark:text-slate-300"}
          to="/messages"
        />
      </section>

      {/* Asymmetric: présences wide + prochains examens rail */}
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
                  Prendre les présences
                </Button>
              </Link>
            }
          >
            {data.attendanceToday.length === 0 ? (
              <PanelEmpty message="Aucune classe pour l’appel du jour." />
            ) : (
              <ul className="space-y-2">
                {data.attendanceToday.slice(0, 6).map((c) => (
                  <li key={c.classId}>
                    <Link
                      to={`/classes/${c.classId}/presences`}
                      data-class-color
                      style={classColorVars({
                        id: c.classId,
                        name: c.className,
                      })}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition hover:brightness-[0.97] dark:hover:brightness-110",
                        CLASS_COLOR_SURFACE,
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ClassColorDot
                          id={c.classId}
                          name={c.className}
                          className="shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {c.className}
                          </p>
                          <p className="text-xs opacity-80">
                            {c.recorded === 0
                              ? `${c.studentCount} élève${c.studentCount > 1 ? "s" : ""} · pas d’appel`
                              : `${c.present} présent${c.present > 1 ? "s" : ""} · ${c.absent} absent${c.absent > 1 ? "s" : ""}${
                                  c.late > 0
                                    ? ` · ${c.late} retard${c.late > 1 ? "s" : ""}`
                                    : ""
                                }`}
                          </p>
                        </div>
                      </div>
                      <Badge
                        tone={
                          c.status === "done"
                            ? "success"
                            : c.status === "partial"
                              ? "warning"
                              : "info"
                        }
                      >
                        {c.status === "done"
                          ? "Fait"
                          : c.status === "partial"
                            ? "En cours"
                            : "À faire"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          icon={FileText}
          title="Prochains examens"
          subtitle="Vos dates à venir"
          action={
            <Link to="/examens" className="block">
              <Button className="w-full">Gérer les examens</Button>
            </Link>
          }
        >
          {data.upcomingExamens.length === 0 ? (
            <PanelEmpty message="Aucun examen à venir." />
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
                    data-class-color
                    style={classColorVars({
                      id: c.classId,
                      name: c.className,
                    })}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 transition hover:brightness-[0.97] dark:hover:brightness-110",
                      CLASS_COLOR_SURFACE,
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <ClassColorDot
                        id={c.classId}
                        name={c.className}
                        className="mt-1.5"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {c.className}
                          {c.gradeLevel ? (
                            <span className="ml-1.5 text-xs font-normal opacity-70">
                              {c.gradeLevel}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs leading-snug opacity-80">
                          {c.subjects.join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span className="mt-0.5 shrink-0 text-xs font-medium opacity-90">
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
              <Link to="/exercices-maison" className="block">
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
              <Link to="/messages" className="block">
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
