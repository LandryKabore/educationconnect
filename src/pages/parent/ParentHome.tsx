import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  MessageSquare,
  NotebookPen,
  Users,
} from "lucide-react";
import { Panel, PanelEmpty } from "@/components/PortalHomeKit";
import { relativeFr, snippet } from "@/lib/portalHomeFormat";
import { HomeworkTomorrowCard } from "@/components/HomeworkTomorrowCard";
import { ProgressRing } from "@/components/ProgressRing";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAttendanceStrip,
  useChildSnapshot,
  useChildTodos,
  useChildrenMeta,
  useParentChildren,
  useParentInbox,
  useWeekHomework,
  type ChildSnapshot,
} from "@/hooks/useParentHome";
import { useUnreadMessagesCount, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import type { ChildSummary } from "@/lib/scaleApi";
import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { formatDateSafe } from "@/lib/dateFr";
import { getTimeGreeting } from "@/lib/greeting";
import {
  CHILD_COLORS,
  ageLabel,
  fmt1,
  fmt2,
  gradeTone,
  initials,
  plural,
  readSelectedChild,
  SELECTED_CHILD_EVENT,
  scoreOn20,
  shortDateFr,
  weekdayDateFr,
  writeSelectedChild,
  type TodoItem,
} from "@/lib/parentHome";
import type { AttendanceStatus } from "@/lib/types";
import { cn, fullName, personName } from "@/lib/utils";

const CARD_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300";

/** Button at the bottom of the summary cards (same teal as the panel buttons). */
const CARD_BTN =
  "flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-medium !text-white transition hover:bg-brand-800 group-hover:bg-brand-800";

const STRIP_CELL: Record<AttendanceStatus, string> = {
  present: "bg-emerald-200 dark:bg-emerald-700/70",
  absent: "bg-rose-500",
  late: "bg-amber-400",
  excused: "bg-sky-400",
};

function rateTone(rate: number | null) {
  if (rate === null) return "text-slate-300";
  if (rate >= 90) return "text-emerald-600";
  if (rate >= 80) return "text-amber-500";
  return "text-rose-600";
}

function averageTone(v: number | null) {
  if (v === null) return "text-slate-300";
  if (v >= 12) return "text-emerald-600";
  if (v >= 10) return "text-brand-600";
  if (v >= 8) return "text-amber-500";
  return "text-rose-600";
}

function CardSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

/* ------------------------------------------------------------------ switcher */

function ChildChip({
  child,
  index,
  age,
  classSectionId,
  selected,
  onSelect,
  showAction,
}: {
  child: ChildSummary;
  index: number;
  age: string | null;
  classSectionId: string | undefined;
  selected: boolean;
  onSelect: () => void;
  /** switch button, only when there is a choice to make */
  showAction: boolean;
}) {
  const { data: snapshot } = useChildSnapshot(child.id, classSectionId);
  const todos = useChildTodos(child.id, child, snapshot);
  const attention = todos.length;
  const avg = snapshot?.average?.annual ?? null;
  const rate = snapshot?.attendance?.rate ?? null;

  return (
    <div
      className={cn(
        "relative flex min-w-[15rem] shrink-0 flex-col gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition md:min-w-0 md:shrink dark:bg-[var(--surface)]",
        selected
          ? "border-brand-600 ring-2 ring-brand-600/20 dark:border-brand-400 dark:ring-brand-400/30"
          : "border-slate-200 dark:border-slate-600",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            CHILD_COLORS[index % CHILD_COLORS.length],
          )}
          aria-hidden="true"
        >
          {initials(child.first_name, child.last_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
            {child.first_name}
          </span>
          <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
            {[child.className ?? "Sans classe", age].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="hidden shrink-0 gap-3 text-center md:flex">
          <span>
            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{fmt1(avg)}</span>
            <span className="block text-[10px] text-slate-500 dark:text-slate-300">moy.</span>
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
              {rate === null ? "—" : `${Math.round(rate)} %`}
            </span>
            <span className="block text-[10px] text-slate-500 dark:text-slate-300">prés.</span>
          </span>
          <span>
            <span
              className={cn(
                "block text-sm font-bold",
                attention > 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100",
              )}
            >
              {attention}
            </span>
            <span className="block text-[10px] text-slate-500 dark:text-slate-300">à faire</span>
          </span>
        </span>
      </div>
      {showAction ? (
        selected ? (
          <span
            aria-current="true"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand-50 text-sm font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Suivi affiché
          </span>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Voir le suivi de {child.first_name}
          </button>
        )
      ) : null}
      {attention > 0 ? (
        <span
          className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-none text-white md:hidden"
          title={`${attention} à faire`}
        >
          {attention}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ banner */

function TodoBanner({
  todos,
  unreadDiscussions,
}: {
  todos: TodoItem[];
  unreadDiscussions: number;
}) {
  const items: TodoItem[] = [...todos];
  if (unreadDiscussions > 0) {
    items.push({
      key: "unread",
      tone: "info",
      text: `${unreadDiscussions} ${plural(unreadDiscussions, "message non lu", "messages non lus")}`,
      to: "/messages",
      cta: "Lire",
    });
  }
  if (items.length === 0) return null;
  const danger = items.some((i) => i.tone === "danger");
  return (
    <section
      aria-label="À faire"
      className={cn(
        "rounded-2xl border p-3 sm:p-4",
        danger
          ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"
          : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
      )}
    >
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />À faire
      </p>
      <ul className="divide-y divide-black/5 dark:divide-white/10">
        {items.map((it) => (
          <li key={it.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-bold",
                  it.tone === "danger"
                    ? "text-rose-800 dark:text-rose-200"
                    : it.tone === "warning"
                      ? "text-amber-900 dark:text-amber-200"
                      : "text-slate-900 dark:text-slate-100",
                )}
              >
                {it.text}
              </p>
              {it.detail ? (
                <p className="truncate text-xs text-slate-600 dark:text-slate-300">{it.detail}</p>
              ) : null}
            </div>
            <Link to={it.to} className="shrink-0">
              <Button variant="secondary" className="min-h-11 px-3 text-sm">
                {it.cta}
              </Button>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ cards */

function AverageCard({
  childId,
  snapshot,
  loading,
}: {
  childId: string;
  snapshot: ChildSnapshot | undefined;
  loading: boolean;
}) {
  const avg = snapshot?.average;
  const value = avg?.annual ?? null;
  return (
    <Link to={`/enfants/${childId}/notes`} className="group block h-full">
      <Card className="flex h-full flex-col p-4 transition hover:border-brand-300 hover:shadow-md">
        {loading ? (
          <CardSkeleton />
        ) : (
          <>
            <p className={CARD_LABEL}>Moyennes · année</p>
            <div className="mt-2 flex items-center gap-3">
              <ProgressRing
                fraction={value === null ? null : value / 20}
                label={fmt1(value)}
                tone={averageTone(value)}
              />
              <div className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Moyenne annuelle</p>
                <p>
                  <span className={cn("font-bold", gradeTone(value))}>{fmt2(value)}</span> /20
                </p>
              </div>
            </div>
            {avg ? (
              <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                {avg.trimesters.map((t) => (
                  <div
                    key={t.period}
                    className="rounded-lg bg-slate-50 px-1 py-1.5 dark:bg-slate-800"
                  >
                    <dt className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-300">
                      {t.period}
                    </dt>
                    <dd className={cn("text-sm font-bold tabular-nums", gradeTone(t.value))}>
                      {fmt2(t.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Aucune note publiée.</p>
            )}
            <span className="mt-auto block pt-4">
              <span className={CARD_BTN}>Voir les notes</span>
            </span>
          </>
        )}
      </Card>
    </Link>
  );
}

function PresenceCard({
  childId,
  snapshot,
  loading,
}: {
  childId: string;
  snapshot: ChildSnapshot | undefined;
  loading: boolean;
}) {
  const att = snapshot?.attendance;
  const rate = att?.rate ?? null;
  const absences = att ? att.totals.absent + att.totals.excused : 0;
  return (
    <Link to={`/enfants/${childId}/presences`} className="group block h-full">
      <Card className="flex h-full flex-col p-4 transition hover:border-brand-300 hover:shadow-md">
        {loading ? (
          <CardSkeleton />
        ) : (
          <>
            <p className={CARD_LABEL}>Présence{att ? ` · ${att.periodLabel}` : ""}</p>
            <div className="mt-2 flex items-center gap-3">
              <ProgressRing
                fraction={rate === null ? null : rate / 100}
                label={rate === null ? "—" : `${Math.round(rate)} %`}
                tone={rateTone(rate)}
              />
              {att && att.totals.total > 0 ? (
                <div className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    {absences} {plural(absences, "absence", "absences")}
                  </p>
                  <p>
                    {att.totals.late} {plural(att.totals.late, "retard", "retards")}
                  </p>
                </div>
              ) : null}
            </div>
            {!att || att.totals.total === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Aucun cours enregistré.</p>
            ) : null}
            <span className="mt-auto block pt-4">
              <span className={CARD_BTN}>Voir les présences</span>
            </span>
          </>
        )}
      </Card>
    </Link>
  );
}

function StripCard({ childId }: { childId: string }) {
  const { data: strip, isLoading, isError } = useAttendanceStrip(childId);
  return (
    <Card className="col-span-2 flex flex-col p-4 lg:col-span-1">
      <p className={CARD_LABEL}>Assiduité · 4 dernières semaines</p>
      {isLoading ? (
        <div className="mt-3 h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true" />
      ) : isError ? (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Indisponible pour le moment.</p>
      ) : !strip || strip.length === 0 ? (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Aucun cours enregistré ces 4 dernières semaines.</p>
      ) : (
        <>
          <div
            className="mt-3 flex flex-wrap gap-1"
            role="img"
            aria-label={`${strip.length} jours de classe : ${strip.filter((d) => d.status === "absent").length} absence(s), ${strip.filter((d) => d.status === "late").length} retard(s)`}
          >
            {strip.map((d) => (
              <span
                key={d.date}
                title={`${weekdayDateFr(d.date)} · ${ATTENDANCE_LABELS[d.status]}`}
                className={cn("h-4 w-4 rounded-[4px]", STRIP_CELL[d.status])}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
            Vert présent · rouge absent · jaune retard · bleu justifié (un carré par jour de classe)
          </p>
        </>
      )}
      <div className="mt-auto pt-4">
        <Link to={`/enfants/${childId}/presences`} className={CARD_BTN}>
          Voir le détail
        </Link>
      </div>
    </Card>
  );
}

function HomeworkPanel({
  childId,
  classSectionId,
}: {
  childId: string;
  classSectionId: string | undefined;
}) {
  const { data, isLoading, isError } = useWeekHomework(childId, classSectionId);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel
      icon={ClipboardList}
      title="Devoirs de la semaine"
      subtitle="Exercices et devoirs des 7 prochains jours"
      action={
        <Link to={`/enfants/${childId}/exercices`} className="block">
          <Button variant="secondary" className="min-h-11 w-full">
            Tous les exercices
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <PanelEmpty message="Devoirs indisponibles pour le moment." />
      ) : !classSectionId ? (
        <PanelEmpty message="Cet enfant n’est pas encore inscrit dans une classe." />
      ) : !data || data.length === 0 ? (
        <PanelEmpty message="Rien à rendre cette semaine." />
      ) : (
        <ul className="space-y-2">
          {data.map((w) => (
            <li key={w.id}>
              <Link
                to={`/enfants/${childId}/${w.type === "examen" ? "devoirs" : "exercices"}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-brand-50/60 dark:bg-[var(--surface-2)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {[w.subject, w.title].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {w.type === "examen" ? "Devoir" : "Exercice"}
                    {w.start_time ? ` · ${w.start_time.slice(0, 5)}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    w.eval_date === today
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-700 dark:text-rose-50"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-600 dark:text-amber-50",
                  )}
                >
                  {w.eval_date === today ? "Aujourd’hui" : weekdayDateFr(w.eval_date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function LatestGradesPanel({ child }: { child: ChildSummary }) {
  const grades = child.recentNotes.filter((n) => !n.is_absent).slice(0, 4);
  return (
    <Panel
      icon={BookOpen}
      title="Dernières notes"
      subtitle={`Publiées pour ${child.first_name}`}
      action={
        <Link to={`/enfants/${child.id}/notes`} className="block">
          <Button variant="secondary" className="min-h-11 w-full">
            Toutes les notes
          </Button>
        </Link>
      }
    >
      {grades.length === 0 ? (
        <PanelEmpty message="Aucune note publiée pour le moment." />
      ) : (
        <ul className="space-y-2">
          {grades.map((n) => {
            const v = scoreOn20(n.score, n.max_score);
            return (
              <li key={n.id}>
                <Link
                  to={`/enfants/${child.id}/notes`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-brand-50/60 dark:bg-[var(--surface-2)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {n.subject ?? "Matière"}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {n.period_label} · {shortDateFr(n.created_at)}
                    </p>
                  </div>
                  <p className={cn("shrink-0 text-lg font-bold", gradeTone(v))}>
                    {fmt1(v)}
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-300"> / 20</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function MessagesPanel({ userId }: { userId: string | undefined }) {
  const { data, isLoading, isError } = useParentInbox(userId);
  return (
    <Panel
      icon={MessageSquare}
      title="Messages"
      subtitle="École et enseignants"
      action={
        <Link to="/messages" className="block">
          <Button variant="secondary" className="min-h-11 w-full">
            <MessageSquare className="h-4 w-4" />
            Voir tous les messages
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <PanelEmpty message="Messages indisponibles pour le moment." />
      ) : !data || data.messages.length === 0 ? (
        <PanelEmpty message="Aucun message pour le moment." />
      ) : (
        <ul className="space-y-2">
          {data.messages.map((m) => {
            const sender = m.sender ? fullName(m.sender.first_name, m.sender.last_name) : "Expéditeur";
            const unread = !m.read_at;
            return (
              <li key={m.id}>
                <Link
                  to="/messages"
                  className={cn(
                    "block rounded-xl px-3 py-2.5 transition hover:bg-brand-50/60",
                    unread ? "bg-brand-50/40 ring-1 ring-brand-100" : "bg-slate-50 dark:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {sender}
                      {unread ? <span className="ml-2 inline-block h-2 w-2 rounded-full bg-brand-500 align-middle" /> : null}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-300">{relativeFr(m.created_at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {m.subject?.trim() || "Sans objet"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{snippet(m.body, 64)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function AnnouncementsPanel({ userId }: { userId: string | undefined }) {
  const { data } = useParentInbox(userId);
  const items = data?.announcements ?? [];
  return (
    <Panel
      icon={Bell}
      title="Annonces de l’école"
      subtitle="Infos officielles de l’administration"
      action={
        <Link to="/annonces" className="block">
          <Button variant="secondary" className="min-h-11 w-full">
            <Bell className="h-4 w-4" />
            Voir les annonces
          </Button>
        </Link>
      }
    >
      {items.length === 0 ? (
        <PanelEmpty message="Aucune annonce pour le moment." />
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-[var(--surface-2)]">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{m.subject?.trim() || "Annonce"}</p>
                <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-300">
                  {formatDateSafe(m.created_at, "d/MM/yyyy")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{snippet(m.body, 110)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ChildQuickLinks({ childId }: { childId: string }) {
  const links = [
    { to: "notes", label: "Notes", icon: BookOpen },
    { to: "bulletin", label: "Bulletin", icon: FileText },
    { to: "presences", label: "Présences", icon: CalendarCheck },
    { to: "emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
    { to: "devoirs", label: "Examens", icon: ClipboardList },
    { to: "exercices", label: "Exercices", icon: NotebookPen },
    { to: "compositions", label: "Compositions", icon: GraduationCap },
  ];
  return (
    <Card className="p-4">
      <p className={CARD_LABEL}>Accès rapide</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={`/enfants/${childId}/${to}`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-brand-300 hover:text-brand-800 dark:border-slate-600 dark:bg-transparent dark:text-slate-100 dark:hover:text-brand-300"
          >
            <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <span className="min-w-0 leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ one child */

function ChildDashboard({
  child,
  classSectionId,
  userId,
  unreadDiscussions,
}: {
  child: ChildSummary;
  classSectionId: string | undefined;
  userId: string | undefined;
  unreadDiscussions: number;
}) {
  const { data: snapshot, isLoading } = useChildSnapshot(child.id, classSectionId);
  const todos = useChildTodos(child.id, child, snapshot);

  return (
    <div className="space-y-4">
      <TodoBanner todos={todos} unreadDiscussions={unreadDiscussions} />

      <HomeworkTomorrowCard userId={userId} moreHref={`/enfants/${child.id}/cahier`} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <AverageCard childId={child.id} snapshot={snapshot} loading={isLoading} />
        <PresenceCard childId={child.id} snapshot={snapshot} loading={isLoading} />
        <StripCard childId={child.id} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <HomeworkPanel childId={child.id} classSectionId={classSectionId} />
        <LatestGradesPanel child={child} />
        <MessagesPanel userId={userId} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AnnouncementsPanel userId={userId} />
        </div>
        <ChildQuickLinks childId={child.id} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ banner parts */

function BannerStat({ label, value, hint, to }: { label: string; value: string; hint: string; to?: string }) {
  const body = (
    <>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums lg:text-[1.75rem]">{value}</p>
      <p className="mt-0.5 truncate text-xs text-white/80">{hint}</p>
    </>
  );
  const cls = "block rounded-md bg-white/10 p-3.5 ring-1 ring-white/15";
  return to ? (
    <Link to={to} className={cn(cls, "transition hover:bg-white/15")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** White card in the banner: the selected child at a glance. */
function SelectedChildCard({
  child,
  index,
  classSectionId,
}: {
  child: ChildSummary;
  index: number;
  classSectionId: string | undefined;
}) {
  // same queries as the dashboard below (shared cache)
  const { data: snapshot } = useChildSnapshot(child.id, classSectionId);
  const todos = useChildTodos(child.id, child, snapshot);
  const avg = snapshot?.average?.annual ?? null;
  const rate = snapshot?.attendance?.rate ?? null;
  return (
    <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-bold",
            CHILD_COLORS[Math.max(0, index) % CHILD_COLORS.length],
          )}
          aria-hidden="true"
        >
          {initials(child.first_name, child.last_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-slate-900">{personName(child.first_name, child.last_name)}</p>
          <p className="truncate text-sm text-slate-500">{child.className ?? "Sans classe"}</p>
        </div>
        <Link
          to={`/enfants/${child.id}/bulletin`}
          className="shrink-0 rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider !text-sky-800 transition hover:bg-sky-200"
        >
          Bulletin
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 pt-3 text-center">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Moyenne</dt>
          <dd className={cn("mt-0.5 text-xl font-bold tabular-nums", avg != null && avg < 10 ? "text-rose-600" : "text-slate-900")}>
            {fmt2(avg)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Présence</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
            {rate == null ? "—" : `${Math.round(rate)} %`}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">À faire</dt>
          <dd className={cn("mt-0.5 text-xl font-bold tabular-nums", todos.length ? "text-rose-600" : "text-emerald-600")}>
            {todos.length}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function ParentHome() {
  const { user, profile, schools, schoolId } = useAuth();
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  const name = personName(profile?.first_name, profile?.last_name);
  const schoolName = schools.find((s) => s.id === schoolId)?.name;

  const { data: children, isLoading, isError } = useParentChildren(user?.id);
  const childIds = useMemo(() => (children ?? []).map((c) => c.id), [children]);
  const { data: meta } = useChildrenMeta(user?.id, childIds);

  const [picked, setPicked] = useState<string | null>(() => readSelectedChild());
  // Only ever show a child the database returned for THIS parent (stored id is just a hint).
  const selected = (children ?? []).find((c) => c.id === picked) ?? children?.[0];
  useEffect(() => {
    if (selected && selected.id !== picked) setPicked(selected.id);
  }, [selected, picked]);
  useEffect(() => {
    const onChange = (e: Event) => setPicked((e as CustomEvent<string>).detail);
    window.addEventListener(SELECTED_CHILD_EVENT, onChange);
    return () => window.removeEventListener(SELECTED_CHILD_EVENT, onChange);
  }, []);

  if (isLoading) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  if (isError || !children) {
    return <p className="text-slate-500">Impossible de charger votre aperçu.</p>;
  }

  return (
    // squarer corners on this page only
    <div className="space-y-4 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Banner: same teal gradient and effects as the student portal */}
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
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">
                {name || <span className="inline-block h-8 w-40 animate-pulse rounded-md bg-white/20" />}
              </h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                Le suivi scolaire de vos enfants, au même endroit.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat
                label={children.length > 1 ? "Enfants" : "Enfant"}
                value={String(children.length)}
                hint={children.length ? children.map((c) => c.first_name).join(", ") : "aucun lié"}
              />
              <BannerStat
                to="/messages"
                label="Messages"
                value={String(unreadInbox.discussions)}
                hint={unreadInbox.discussions ? plural(unreadInbox.discussions, "non lu", "non lus") : "tout est lu"}
              />
              <BannerStat
                to="/annonces"
                label="Annonces"
                value={String(unreadInbox.announcements)}
                hint={
                  unreadInbox.announcements
                    ? plural(unreadInbox.announcements, "nouvelle", "nouvelles")
                    : "rien de nouveau"
                }
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            {selected ? (
              <SelectedChildCard
                child={selected}
                index={children.findIndex((c) => c.id === selected.id)}
                classSectionId={meta?.classId[selected.id]}
              />
            ) : (
              <div className="rounded-md bg-white/10 p-5 ring-1 ring-white/15">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Mes enfants</p>
                <p className="mt-2 text-lg font-semibold">Aucun enfant lié pour le moment</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      {children.length === 0 || !selected ? (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Aucun enfant lié à votre compte</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Demandez à l’école de lier votre compte à vos enfants. Vous retrouverez ici leurs notes, présences et devoirs.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {children.length > 1 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Vos enfants</h2>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Choisissez l’enfant dont vous voulez voir le suivi.
              </p>
            </div>
          ) : null}
          <nav
            aria-label="Choisir un enfant"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-2 md:mx-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] md:overflow-visible md:px-0"
          >
            {children.map((c, i) => (
              <ChildChip
                key={c.id}
                child={c}
                index={i}
                age={ageLabel(meta?.dob[c.id])}
                classSectionId={meta?.classId[c.id]}
                selected={c.id === selected.id}
                showAction={children.length > 1}
                onSelect={() => {
                  setPicked(c.id);
                  writeSelectedChild(c.id);
                }}
              />
            ))}
          </nav>

          <ChildDashboard
            key={selected.id}
            child={selected}
            classSectionId={meta?.classId[selected.id]}
            userId={user?.id}
            unreadDiscussions={unreadInbox.discussions}
          />
        </>
      )}
    </div>
  );
}
