import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
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
  QuickLink,
  relativeFr,
  snippet,
  type InboxPreview,
} from "@/components/PortalHomeKit";
import { formatDateSafe } from "@/lib/dateFr";
import { Badge, Button, EmptyState } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { usePendingExamsCount } from "@/hooks/usePendingExamsCount";
import { useStudentsWithoutClassCount } from "@/hooks/useStudentsWithoutClassCount";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName } from "@/lib/utils";

export default function EcoleOverview() {
  const { schoolId, schools, user, profile } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: sansClasse = 0 } = useStudentsWithoutClassCount();
  const { data: pendingExams = 0 } = usePendingExamsCount();
  const name = fullName(profile?.first_name, profile?.last_name);

  const { data, isLoading } = useQuery({
    queryKey: ["ecole-home", schoolId, user?.id],
    enabled: !!schoolId && !!user?.id,
    queryFn: async () => {
      const sid = schoolId!;
      const uid = user!.id;

      const [classes, students, teachers, subjects, parents, yearRes, msgRes] =
        await Promise.all([
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
            .from("roles_utilisateurs")
            .select("id", { count: "exact", head: true })
            .eq("school_id", sid)
            .eq("role", "parent"),
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
        ]);

      const allMsgs = (msgRes.data ?? []) as InboxPreview[];

      return {
        classes: classes.count ?? 0,
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        subjects: subjects.count ?? 0,
        parents: parents.count ?? 0,
        yearLabel: (yearRes.data as { label?: string } | null)?.label ?? null,
        announcements: allMsgs.filter((m) => m.is_announcement).slice(0, 3),
        recentMessages: allMsgs.filter((m) => !m.is_announcement).slice(0, 3),
      };
    },
  });

  if (!schoolId) {
    return <EmptyState message="Aucune école associée à votre compte." />;
  }

  if (isLoading || !data) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  const context = [
    school?.name,
    data.yearLabel ? `Année ${data.yearLabel}` : null,
    "Administrateur",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PortalHomeHeader
          icon={School}
          name={name}
          context={context}
          unreadMessages={unreadMessages}
        />
        <div className="flex flex-wrap gap-2 lg:pt-2">
          <Link to="/ecole/parametres">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
              Paramètres
            </Button>
          </Link>
          {pendingExams > 0 ? (
            <Link to="/examens-ecole">
              <Button size="sm">
                <FileText className="h-4 w-4" />
                {pendingExams} examen{pendingExams > 1 ? "s" : ""} à confirmer
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {pendingExams > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/40">
          <div>
            <p className="font-semibold text-amber-950">
              Examens en attente de confirmation
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {pendingExams} proposition{pendingExams > 1 ? "s" : ""} des
              enseignants à valider
            </p>
          </div>
          <Link to="/examens-ecole">
            <Button size="sm">Voir les examens</Button>
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
          label="Examens"
          value={String(pendingExams)}
          hint={
            pendingExams > 0
              ? "À confirmer"
              : "Aucune demande en attente"
          }
          valueClass={
            pendingExams > 0 ? "text-amber-600" : "text-emerald-600"
          }
          to="/examens-ecole"
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
          icon={ClipboardList}
          title="Pilotage"
          subtitle="Accès rapides à l’essentiel"
          action={
            <Link to="/examens-ecole" className="block">
              <Button className="w-full" variant="outline">
                <FileText className="h-4 w-4" />
                Examens
                {pendingExams > 0 ? (
                  <Badge tone="warning">{pendingExams}</Badge>
                ) : null}
              </Button>
            </Link>
          }
        >
          <ul className="space-y-2">
            {[
              {
                to: "/examens-ecole",
                label: "Examens",
                hint:
                  pendingExams > 0
                    ? `${pendingExams} à confirmer`
                    : "Dates proposées par les profs",
                icon: FileText,
              },
              {
                to: "/eleves",
                label: "Élèves",
                hint:
                  sansClasse > 0
                    ? `${sansClasse} à affecter`
                    : `${data.students} inscrits`,
                icon: GraduationCap,
              },
              {
                to: "/emplois-du-temps",
                label: "Emplois du temps",
                hint: "Lundi → samedi",
                icon: Calendar,
              },
              {
                to: "/bulletins",
                label: "Bulletins",
                hint: "Génération PDF",
                icon: ClipboardList,
              },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-brand-50/60"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500">{item.hint}</p>
                  </div>
                  <span className="text-xs font-medium text-brand-700">
                    Ouvrir →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          icon={Bell}
          title="Annonces & messages"
          subtitle="Communications de l’école"
          action={
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to="/messages" className="block">
                <Button variant="outline" className="w-full">
                  <Bell className="h-4 w-4" />
                  Annonces
                </Button>
              </Link>
              <Link to="/messages" className="block">
                <Button className="w-full">
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </Button>
              </Link>
            </div>
          }
        >
          {data.announcements.length === 0 &&
          data.recentMessages.length === 0 ? (
            <PanelEmpty message="Aucune communication récente." />
          ) : (
            <div className="space-y-3">
              {data.announcements.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Annonces
                  </p>
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
                </div>
              ) : null}

              {data.recentMessages.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Messages récents
                  </p>
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
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/annees" label="Années scolaires" icon={Calendar} />
        <QuickLink to="/classes" label="Classes" icon={Users} />
        <QuickLink to="/programmes" label="Programmes" icon={BookOpen} />
        <QuickLink to="/parents" label="Parents" icon={Users} />
        <QuickLink to="/emplois-du-temps" label="Emplois du temps" icon={Calendar} />
        <QuickLink to="/presences-ecole" label="Présences" icon={CheckCircle2} />
        <QuickLink
          to="/examens-ecole"
          label="Examens"
          icon={FileText}
          badge={pendingExams}
        />
        <QuickLink to="/bulletins" label="Bulletins" icon={ClipboardList} />
        <QuickLink to="/messages" label="Messages" icon={MessageSquare} />
        <QuickLink to="/ecole/parametres" label="Paramètres" icon={Settings} />
      </section>
    </div>
  );
}
