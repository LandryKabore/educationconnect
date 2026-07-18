import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bell,
  BookOpen,
  ClipboardList,
  MessageSquare,
  User,
  Users,
} from "lucide-react";
import {
  MetricCard,
  Panel,
  PanelEmpty,
  PortalHomeHeader,
  QuickLink,
  relativeFr,
  snippet,
  type InboxPreview,
} from "@/components/PortalHomeKit";
import { Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName } from "@/lib/utils";

export default function TeacherHome() {
  const { user, profile, schools, schoolId } = useAuth();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const name = fullName(profile?.first_name, profile?.last_name);
  const schoolName = schools.find((s) => s.id === schoolId)?.name;

  const { data, isLoading } = useQuery({
    queryKey: ["teacher-home", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const uid = user!.id;

      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("id, class_section_id, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", uid);
      if (error) throw error;

      const classes = (aff ?? []).map((a) => {
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

      const uniqueClassIds = [...new Set(classes.map((c) => c.classId))];

      let studentsCount = 0;
      if (uniqueClassIds.length > 0) {
        const { count } = await supabase
          .from("inscriptions")
          .select("id", { count: "exact", head: true })
          .in("class_section_id", uniqueClassIds)
          .eq("status", "active");
        studentsCount = count ?? 0;
      }

      const { count: devoirsCount } = await supabase
        .from("devoirs")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", uid);

      const { data: recentDevoirs } = await supabase
        .from("devoirs")
        .select("id, title, due_date, classes(name), matieres(name)")
        .eq("teacher_id", uid)
        .order("created_at", { ascending: false })
        .limit(4);

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
        uniqueClasses: uniqueClassIds.length,
        studentsCount,
        devoirsCount: devoirsCount ?? 0,
        recentDevoirs: (recentDevoirs ?? []) as {
          id: string;
          title: string;
          due_date: string | null;
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Classes"
          value={String(data.uniqueClasses)}
          hint={`${data.classes.length} affectation${data.classes.length > 1 ? "s" : ""}`}
          valueClass="text-brand-600"
          to="/devoirs"
        />
        <MetricCard
          label="Élèves"
          value={String(data.studentsCount)}
          hint="Dans vos classes"
          valueClass="text-sky-600"
          to="/devoirs"
        />
        <MetricCard
          label="Devoirs"
          value={String(data.devoirsCount)}
          hint="Créés au total"
          valueClass="text-amber-600"
          to="/devoirs"
        />
        <MetricCard
          label="Messages"
          value={String(unreadMessages)}
          hint="Non lus"
          valueClass={unreadMessages > 0 ? "text-rose-600" : "text-slate-500 dark:text-slate-300"}
          to="/messages"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={Users}
          title="Mes classes"
          subtitle="Classes et matières assignées"
          action={
            <Link to="/devoirs" className="block">
              <Button className="w-full">Gérer les devoirs</Button>
            </Link>
          }
        >
          {data.classes.length === 0 ? (
            <PanelEmpty message="Aucune affectation pour le moment." />
          ) : (
            <ul className="space-y-2">
              {data.classes.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/classes/${c.classId}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-brand-50/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {c.className}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[c.subjectName, c.gradeLevel].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-brand-700">
                      Ouvrir →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={ClipboardList}
          title="Derniers devoirs"
          subtitle="Les plus récemment créés"
          action={
            <Link to="/devoirs" className="block">
              <Button className="w-full">Voir tous les devoirs</Button>
            </Link>
          }
        >
          {data.recentDevoirs.length === 0 ? (
            <PanelEmpty message="Aucun devoir créé pour le moment." />
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
                      {format(parseISO(d.due_date), "d MMM", { locale: fr })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

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
                      {format(new Date(m.created_at), "d/MM/yyyy")}
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
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink to="/devoirs" label="Devoirs" icon={ClipboardList} />
        <QuickLink to="/messages" label="Messages" icon={MessageSquare} />
        <QuickLink to="/profil" label="Mon profil" icon={User} />
      </section>
    </div>
  );
}
