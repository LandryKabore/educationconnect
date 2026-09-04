import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
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
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import { cn, fullName, personName } from "@/lib/utils";

type ChildCard = {
  id: string;
  name: string;
  className: string;
  notesCount: number;
  absences: number;
  recentNote: {
    subject: string;
    scoreOn20: string;
    period: string;
  } | null;
};

export default function ParentHome() {
  const { user, profile, schools, schoolId } = useAuth();
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const name = personName(profile?.first_name, profile?.last_name);
  const schoolName = schools.find((s) => s.id === schoolId)?.name;

  const { data, isLoading } = useQuery({
    queryKey: ["parent-home", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const uid = user!.id;

      const { data: links, error } = await supabase
        .from("liens_parent_eleve")
        .select(
          "student_id, profils:profils!liens_parent_eleve_student_id_fkey(id, first_name, last_name)",
        )
        .eq("parent_id", uid);
      if (error) throw error;

      const children: ChildCard[] = [];
      let totalNotes = 0;
      let totalAbsences = 0;
      const activity: {
        id: string;
        childName: string;
        childId: string;
        subject: string;
        scoreOn20: string;
        period: string;
        created_at: string;
      }[] = [];

      for (const link of links ?? []) {
        const child = (
          link as unknown as {
            student_id: string;
            profils: {
              id: string;
              first_name: string;
              last_name: string;
            } | null;
          }
        ).profils;
        if (!child) continue;

        const childName = fullName(child.first_name, child.last_name);

        const { data: enrollment } = await supabase
          .from("inscriptions")
          .select("classes(name)")
          .eq("student_id", child.id)
          .eq("status", "active")
          .maybeSingle();

        const { count: absences } = await supabase
          .from("presences")
          .select("id", { count: "exact", head: true })
          .eq("student_id", child.id)
          .eq("status", "absent");

        const { count: notesCount } = await supabase
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("student_id", child.id);

        const { data: recentNotes } = await supabase
          .from("notes")
          .select(
            "id, score, max_score, period_label, created_at, is_absent, matieres(name)",
          )
          .eq("student_id", child.id)
          .order("created_at", { ascending: false })
          .limit(5);

        const notes = (recentNotes ?? []) as unknown as {
          id: string;
          score: number;
          max_score: number;
          period_label: string;
          created_at: string;
          is_absent: boolean;
          matieres: { name: string } | null;
        }[];

        const abs = absences ?? 0;
        const nCount = notesCount ?? 0;
        totalAbsences += abs;
        totalNotes += nCount;

        const latest = notes.find((n) => !n.is_absent);
        const scoreOn20 = (score: number, max: number) =>
          max > 0 ? ((score / max) * 20).toFixed(1) : "—";

        children.push({
          id: child.id,
          name: childName,
          className:
            (
              enrollment as {
                classes?: { name: string } | null;
              } | null
            )?.classes?.name ?? "Sans classe",
          notesCount: nCount,
          absences: abs,
          recentNote: latest
            ? {
                subject: latest.matieres?.name ?? "Matière",
                scoreOn20: scoreOn20(latest.score, latest.max_score),
                period: latest.period_label,
              }
            : null,
        });

        for (const n of notes) {
          activity.push({
            id: n.id,
            childName,
            childId: child.id,
            subject: n.matieres?.name ?? "Matière",
            scoreOn20: scoreOn20(n.score, n.max_score),
            period: n.period_label,
            created_at: n.created_at,
          });
        }
      }

      activity.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

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
        children,
        totalNotes,
        totalAbsences,
        recentActivity: activity.slice(0, 4),
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
        icon={Users}
        name={name}
        context={[schoolName, "Parent"].filter(Boolean).join(" · ")}
        unreadInbox={unreadInbox}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Enfants"
          value={String(data.children.length)}
          hint="Liés à votre compte"
          valueClass="text-brand-600"
          to="/enfants"
        />
        <MetricCard
          label="Notes"
          value={String(data.totalNotes)}
          hint="Publiées au total"
          valueClass="text-sky-600"
          to="/enfants"
        />
        <MetricCard
          label="Absences"
          value={String(data.totalAbsences)}
          hint="Tous enfants confondus"
          valueClass={
            data.totalAbsences > 0 ? "text-rose-600" : "text-slate-500 dark:text-slate-300"
          }
          to="/enfants"
        />
        <MetricCard
          label="Messages"
          value={String(unreadInbox.discussions)}
          hint="Non lus"
          valueClass={unreadInbox.discussions > 0 ? "text-amber-600" : "text-slate-500 dark:text-slate-300"}
          to="/messages"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={Users}
          title="Mes enfants"
          subtitle="Suivi scolaire en un coup d’œil"
          action={
            <Link to="/enfants" className="block">
              <Button className="w-full">Voir tous les enfants</Button>
            </Link>
          }
        >
          {data.children.length === 0 ? (
            <PanelEmpty message="Aucun enfant lié à votre compte." />
          ) : (
            <ul className="space-y-2">
              {data.children.map((child) => (
                <li
                  key={child.id}
                  className="rounded-xl bg-slate-50 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {child.name}
                      </p>
                      <p className="text-xs text-slate-500">{child.className}</p>
                    </div>
                    <div className="flex shrink-0 gap-3 text-center">
                      <div>
                        <p className="text-sm font-bold text-sky-600">
                          {child.notesCount}
                        </p>
                        <p className="text-[10px] text-slate-400">notes</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-rose-600">
                          {child.absences}
                        </p>
                        <p className="text-[10px] text-slate-400">abs.</p>
                      </div>
                    </div>
                  </div>
                  {child.recentNote ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Dernière note · {child.recentNote.subject}{" "}
                      <span className="font-semibold text-brand-700">
                        {child.recentNote.scoreOn20}/20
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-brand-700">
                    <Link
                      to={`/enfants/${child.id}/notes`}
                      className="hover:underline"
                    >
                      Notes →
                    </Link>
                    <Link
                      to={`/enfants/${child.id}/presences`}
                      className="hover:underline"
                    >
                      Présences →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={BookOpen}
          title="Activité récente"
          subtitle="Dernières notes de vos enfants"
          action={
            <Link to="/enfants" className="block">
              <Button className="w-full">Suivi des enfants</Button>
            </Link>
          }
        >
          {data.recentActivity.length === 0 ? (
            <PanelEmpty message="Aucune note publiée pour le moment." />
          ) : (
            <ul className="space-y-2">
              {data.recentActivity.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/enfants/${a.childId}/notes`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-brand-50/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {a.childName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.subject} · {a.period}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-brand-700">
                      {a.scoreOn20}
                      <span className="text-xs font-medium text-slate-400">
                        {" "}
                        / 20
                      </span>
                    </p>
                  </Link>
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

        <Panel
          icon={MessageSquare}
          title="Messages récents"
          subtitle="Échanges avec l’école et les enseignants"
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

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/enfants" label="Mes enfants" icon={Users} />
        <QuickLink to="/messages" label="Messages" icon={MessageSquare} />
        <QuickLink to="/profil" label="Mon profil" icon={User} />
        <QuickLink
          to={
            data.children[0]
              ? `/enfants/${data.children[0].id}/notes`
              : "/enfants"
          }
          label="Notes"
          icon={BookOpen}
        />
      </section>
    </div>
  );
}
