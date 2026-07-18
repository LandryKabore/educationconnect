import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import {
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
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
import { Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { supabase } from "@/lib/supabase";
import { cn, fullName } from "@/lib/utils";

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
  const name = fullName(profile?.first_name, profile?.last_name);

  const { data, isLoading } = useQuery({
    queryKey: ["student-home", user?.id],
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
        .select("id, score, max_score, period_label, created_at, matieres(name)")
        .eq("student_id", uid)
        .order("created_at", { ascending: false })
        .limit(40);

      const { count: notesCountExact } = await supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("student_id", uid);

      const notes = (notesData ?? []) as {
        id: string;
        score: number;
        max_score: number;
        period_label: string;
        created_at: string;
        matieres: { name: string } | null;
      }[];

      const scored = notes
        .map((n) => on20(n.score, n.max_score))
        .filter((v): v is number => v != null);
      const average =
        scored.length > 0
          ? scored.reduce((a, b) => a + b, 0) / scored.length
          : null;

      const { data: presenceData } = await supabase
        .from("presences")
        .select("status")
        .eq("student_id", uid)
        .limit(120);

      const presences = (presenceData ?? []) as { status: string }[];
      const presentish = presences.filter(
        (p) => p.status === "present" || p.status === "late" || p.status === "excused",
      ).length;
      const attendanceRate =
        presences.length > 0
          ? Math.round((presentish / presences.length) * 100)
          : null;
      const absencesCount = presences.filter((p) => p.status === "absent").length;

      let pendingDevoirs: {
        id: string;
        title: string;
        due_date: string | null;
        kind: "exercice_maison" | "examen";
        matieres: { name: string } | null;
      }[] = [];
      let todaySlots: {
        id: string;
        start_time: string;
        end_time: string;
        room: string | null;
        matieres: { name: string } | null;
      }[] = [];

      if (classId) {
        const { data: devoirsData } = await supabase
          .from("devoirs")
          .select(
            "id, title, due_date, kind, matieres(name), rendus_devoirs!left(id)",
          )
          .eq("class_section_id", classId)
          .eq("rendus_devoirs.student_id", uid)
          .order("due_date", { ascending: true })
          .limit(12);

        pendingDevoirs = (
          (devoirsData ?? []) as {
            id: string;
            title: string;
            due_date: string | null;
            kind: "exercice_maison" | "examen";
            matieres: { name: string } | null;
            rendus_devoirs: { id: string }[];
          }[]
        )
          .filter((d) => (d.rendus_devoirs?.length ?? 0) === 0)
          .slice(0, 4);

        const { data: slots } = await supabase
          .from("creneaux_edt")
          .select("id, start_time, end_time, room, matieres(name)")
          .eq("class_section_id", classId)
          .eq("day_of_week", dbDayOfWeek())
          .order("start_time");
        todaySlots = (slots ?? []) as typeof todaySlots;
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
        average,
        attendanceRate,
        absencesCount,
        notesCount: notesCountExact ?? notes.length,
        recentNotes: notes.slice(0, 4),
        pendingDevoirs,
        todaySlots,
        announcements,
        recentMessages,
        todayLabel: WEEKDAY_LABELS[dbDayOfWeek()] ?? "Aujourd’hui",
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

  const classLabel = [
    data.className ?? "Sans classe",
    data.gradeLevel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <PortalHomeHeader
        icon={GraduationCap}
        name={name}
        context={classLabel}
        unreadMessages={unreadMessages}
      />

      {/* Key metrics */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Moyenne"
          value={data.average != null ? data.average.toFixed(1) : "—"}
          hint={
            data.average != null
              ? "Sur 20 · toutes notes"
              : "Pas encore de notes"
          }
          valueClass={
            data.average == null
              ? "text-slate-500 dark:text-slate-300"
              : data.average >= 10
                ? "text-brand-600"
                : "text-amber-600"
          }
          to="/mes-notes"
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
          label="À rendre"
          value={String(data.pendingDevoirs.length)}
          hint="Exercices / examens"
          valueClass={
            data.pendingDevoirs.length > 0
              ? "text-rose-600"
              : "text-slate-500 dark:text-slate-300"
          }
          to="/mes-exercices"
        />
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
          {data.recentNotes.length === 0 ? (
            <PanelEmpty message="Aucune note disponible pour le moment." />
          ) : (
            <ul className="space-y-2">
              {data.recentNotes.map((n) => {
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
          subtitle="Cours du jour et travaux à rendre"
          action={
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to="/mon-emploi-du-temps" className="block">
                <Button variant="outline" className="w-full">
                  Emploi du temps
                </Button>
              </Link>
              <Link to="/mes-exercices" className="block">
                <Button className="w-full">Exercices</Button>
              </Link>
            </div>
          }
        >
          {data.todaySlots.length === 0 && data.pendingDevoirs.length === 0 ? (
            <PanelEmpty message="Rien de prévu pour aujourd’hui." />
          ) : (
            <div className="space-y-3">
              {data.todaySlots.length > 0 ? (
                <ul className="space-y-2">
                  {data.todaySlots.slice(0, 3).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                    >
                      <span className="w-20 shrink-0 text-xs font-semibold tabular-nums text-brand-700">
                        {s.start_time?.slice(0, 5)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {s.matieres?.name ?? "Cours"}
                        </p>
                        {s.room ? (
                          <p className="text-xs text-slate-500">Salle {s.room}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {data.pendingDevoirs.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    À rendre
                  </p>
                  <ul className="space-y-2">
                    {data.pendingDevoirs.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-start justify-between gap-2 rounded-xl bg-amber-50/80 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {d.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[
                              d.kind === "examen" ? "Examen" : "Exercice",
                              d.matieres?.name ?? "Matière",
                            ].join(" · ")}
                          </p>
                        </div>
                        {d.due_date ? (
                          <span className="shrink-0 text-xs font-medium text-amber-800">
                            {formatDateSafe(d.due_date, "d MMM", {
                              locale: fr,
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
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
          {data.announcements.length === 0 ? (
            <PanelEmpty message="Aucune annonce pour le moment." />
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
