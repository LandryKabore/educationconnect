import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
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
import { enterSetupGuide } from "@/components/SetupGuideBar";
import { Badge, Button, EmptyState } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolSetupProgress } from "@/hooks/useSchoolSetupProgress";
import { useStudentsWithoutClassCount } from "@/hooks/useStudentsWithoutClassCount";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName } from "@/lib/utils";

export default function EcoleOverview() {
  const { schoolId, schools, user, profile } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const { progress, nextStep, steps } = useSchoolSetupProgress();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: sansClasse = 0 } = useStudentsWithoutClassCount();
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

  const setupIncomplete = progress && !progress.complete;
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
          <Link to="/ecole/configuration">
            <Button size="sm">
              {setupIncomplete ? "Continuer la config." : "Configuration"}
            </Button>
          </Link>
        </div>
      </div>

      {setupIncomplete ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-amber-950">
                Mise en place de l’école
              </p>
              <p className="mt-1 text-sm text-amber-900">
                {progress.doneRequired} / {progress.totalRequired} étapes
                obligatoires · {progress.percent} %
              </p>
              {nextStep ? (
                <p className="mt-2 text-sm text-amber-800">
                  Prochaine étape : <strong>{nextStep.title}</strong>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {nextStep ? (
                <Link
                  to={`${nextStep.to}?setup=1`}
                  onClick={() => enterSetupGuide()}
                >
                  <Button size="sm">Continuer</Button>
                </Link>
              ) : null}
              <Link to="/ecole/configuration">
                <Button size="sm" variant="outline">
                  Voir le guide
                </Button>
              </Link>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {steps
              .filter((s) => !s.optional)
              .map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  {s.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-amber-400" />
                  )}
                  <span
                    className={
                      s.status === "done" ? "text-slate-600" : "text-amber-950"
                    }
                  >
                    {s.title}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : progress?.complete ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/40">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            <p className="font-medium text-emerald-900">
              Configuration de base terminée
            </p>
          </div>
          <Badge tone="success">Prêt</Badge>
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
          label="Enseignants"
          value={String(data.teachers)}
          hint="Comptes actifs"
          valueClass="text-violet-600"
          to="/enseignants"
        />
        <MetricCard
          label="Matières"
          value={String(data.subjects)}
          hint={`${data.parents} parent(s)`}
          valueClass="text-emerald-600"
          to="/matieres"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={ClipboardList}
          title="Pilotage"
          subtitle="Accès rapides à l’essentiel"
          action={
            <Link to="/ecole/configuration" className="block">
              <Button className="w-full" variant="outline">
                Guide de configuration
              </Button>
            </Link>
          }
        >
          <ul className="space-y-2">
            {[
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
                to: "/enseignants",
                label: "Enseignants",
                hint: `${data.teachers} compte(s)`,
                icon: Users,
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
        <QuickLink to="/examens-ecole" label="Examens" icon={ClipboardList} />
        <QuickLink to="/bulletins" label="Bulletins" icon={ClipboardList} />
        <QuickLink to="/messages" label="Messages" icon={MessageSquare} />
        <QuickLink to="/ecole/parametres" label="Paramètres" icon={Settings} />
      </section>
    </div>
  );
}
