import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  ListTodo,
  MessageSquare,
  NotebookPen,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { iso, lessonHours, lessonPath, type JobState, type Lesson, type TeacherSlot } from "@/hooks/useTeacherLessons";
import { currentCompositions, type TeacherCompositionSession } from "@/hooks/useTeacherCompositions";
import { useTeacherTodo } from "@/hooks/useTeacherTodo";
import { getTimeGreeting } from "@/lib/greeting";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { cn, personName } from "@/lib/utils";
import { useNow } from "@/lib/weekGrid";
import { Card } from "@/components/ui";
import { timeFr } from "@/lib/timetableLayout";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLong = (date: string) => capitalize(format(new Date(`${date}T12:00:00`), "EEEE d MMMM", { locale: fr }));

/** What the teacher should do next for a lesson. */
function nextAction(l: Lesson): { label: string; tab: "appel" | "cahier"; primary: boolean } | null {
  if (l.timing === "upcoming") return { label: "Préparer", tab: "appel", primary: false };
  if (l.appel !== "done" && l.studentCount > 0) return { label: "Faire l’appel", tab: "appel", primary: true };
  if (l.cahier !== "done") return { label: "Remplir le cahier", tab: "cahier", primary: l.timing === "over" };
  return null;
}

/** Teacher home: today's lessons, what to do now, and what is late. */
export default function TeacherDay() {
  const { profile } = useAuth();
  const now = useNow(60_000);
  const todo = useTeacherTodo(now);
  const { todayLessons, nextDay, hasTimetable, isLoading, slots, compositions } = todo.lessons;
  const compos = currentCompositions(compositions, iso(now));
  const name = personName(profile?.first_name, profile?.last_name);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // the day's jobs: a roll call per started lesson, a cahier per finished lesson
  const due = todayLessons.reduce(
    (acc, l) => {
      if (l.appelDue) {
        acc.total += 1;
        if (l.appel === "done") acc.done += 1;
      }
      if (l.cahierDue) {
        acc.total += 1;
        if (l.cahier === "done") acc.done += 1;
      }
      return acc;
    },
    { done: 0, total: 0 },
  );
  const lateCount = todo.lateAppels.length + todo.lateCahiers.length;
  const live = todayLessons.find((l) => l.timing === "live");
  const upcoming = todayLessons.find((l) => l.timing === "upcoming");
  const previousDaysLate = todo.lessons.lateLessons.filter((l) => l.date !== format(now, "yyyy-MM-dd"));

  return (
    <div className="space-y-6">
      {/* ── Banner ── */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                {getTimeGreeting()} · {dayLong(format(now, "yyyy-MM-dd"))}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">{name || "Ma journée"}
                <span className="animate-greeting-wave ml-2" aria-hidden>👋</span>
              </h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                {todayLessons.length === 0
                  ? "Pas de cours aujourd’hui."
                  : `${todayLessons.length} cours aujourd’hui · ${Math.max(0, due.total - due.done)} tâche${due.total - due.done > 1 ? "s" : ""} en attente`}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerTile label="Cours aujourd’hui" value={String(todayLessons.length)} hint={todayLessons.length ? `${todayLessons.filter((l) => l.timing === "over").length} terminé${todayLessons.filter((l) => l.timing === "over").length > 1 ? "s" : ""}` : "journée libre"} />
              <BannerTile
                label="Tâches du jour"
                value={due.total ? `${due.done}/${due.total}` : "—"}
                hint={due.total === 0 ? "rien à faire pour l’instant" : due.done === due.total ? "tout est fait" : "appels et cahiers"}
              />
              <BannerTile
                to="/a-faire"
                label="En retard"
                value={String(lateCount)}
                hint={lateCount ? "voir la liste" : "rien en retard"}
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <NowCard live={live} upcoming={upcoming} nowMin={nowMin} todayCount={todayLessons.length} nextDay={nextDay} due={due} />
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      {compos.length > 0 ? <CompositionsCard sessions={compos} slots={slots} now={now} /> : null}

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* ── Today's lessons ── */}
        <section className="lg:col-span-8">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Aujourd’hui</h2>
            <Link to="/mon-emploi-du-temps" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Emploi du temps
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-[var(--surface-2)]" />
              ))}
            </div>
          ) : todayLessons.length === 0 ? (
            <Card className="flex flex-col items-center py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                <CalendarDays className="h-6 w-6" />
              </span>
              <p className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-50">Pas de cours aujourd’hui</p>
              <p className="mt-1 text-sm text-slate-500">
                {!hasTimetable
                  ? "Votre emploi du temps n’est pas encore saisi par l’établissement."
                  : nextDay
                    ? `Prochain cours : ${dayLong(nextDay.date).toLowerCase()} à ${timeFr(nextDay.first.start_time)} — ${nextDay.first.matieres?.name ?? ""} · ${nextDay.first.classes?.name ?? ""}`
                    : "Aucun cours cette semaine."}
              </p>
            </Card>
          ) : (
            <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[4.6rem] before:top-4 before:w-px before:bg-slate-200 dark:before:bg-[var(--border)]">
              {todayLessons.map((l) => (
                <LessonRow key={l.key} lesson={l} nowMin={nowMin} />
              ))}
            </ol>
          )}
        </section>

        {/* ── Side: late, grading, shortcuts ── */}
        <aside className="space-y-6 lg:col-span-4">
          <Card>
            <div className="flex items-center gap-3">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", previousDaysLate.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                {previousDaysLate.length ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Jours précédents</h3>
                <p className="text-xs text-slate-500">Appels et cahiers des 7 derniers jours</p>
              </div>
            </div>
            {previousDaysLate.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Tout est à jour.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-[var(--border)]">
                {previousDaysLate.slice(0, 5).map((l) => (
                  <li key={l.key}>
                    <Link to={lessonPath(l, l.appel !== "done" ? "appel" : "cahier")} className="flex items-center gap-3 py-2.5">
                      <span className="w-14 shrink-0 text-xs font-semibold capitalize text-slate-500">
                        {format(new Date(`${l.date}T12:00:00`), "EEE d", { locale: fr })}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {l.subjectName} · {l.className}
                        </span>
                        <span className="block truncate text-xs text-amber-700">
                          {[l.appel !== "done" ? "appel" : null, l.cahier !== "done" ? "cahier" : null].filter(Boolean).join(" et ")} à faire
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {previousDaysLate.length > 5 ? (
              <Link to="/a-faire" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Voir les {previousDaysLate.length}
              </Link>
            ) : null}
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                <NotebookPen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Notes à saisir</h3>
                <p className="text-xs text-slate-500">Évaluations passées sans toutes les notes</p>
              </div>
              <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{todo.ungraded.length}</span>
            </div>
            {todo.ungraded.slice(0, 3).map((e) => (
              <Link
                key={e.id}
                to={`/classes/${e.classId}/notes/${e.id}`}
                className="mt-3 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100 dark:bg-[var(--surface-2)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{e.title}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {e.className} · {e.missing} note{e.missing > 1 ? "s" : ""} manquante{e.missing > 1 ? "s" : ""}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))}
            {todo.ungraded.length > 3 ? (
              <Link to="/a-faire" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Tout voir
              </Link>
            ) : null}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Shortcut to="/a-faire" icon={ListTodo} label="À faire" badge={todo.count} />
            <Shortcut to="/messages" icon={MessageSquare} label="Messages" badge={todo.unreadMessages} />
            <Shortcut to="/mes-classes" icon={Users} label="Mes classes" />
            <Shortcut to="/exercices-maison" icon={BookOpenCheck} label="Exercices de maison" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

const shortDate = (d: string) => format(new Date(`${d}T12:00:00`), "d MMMM", { locale: fr });
const shortDay = (d: string) => capitalize(format(new Date(`${d}T12:00:00`), "EEE d", { locale: fr }));

/**
 * Classes sitting (or about to sit) their compositions: their lessons are suspended and the papers
 * take their place. Shown per class, with the papers of the day (or the first ones to come).
 */
function CompositionsCard({ sessions, slots, now }: { sessions: TeacherCompositionSession[]; slots: TeacherSlot[]; now: Date }) {
  const today = iso(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const mySubjects = new Set(slots.map((s) => s.matieres?.name).filter(Boolean));
  return (
    <Card className="border-l-4 border-l-amber-600 p-5">
      <div className="space-y-5 divide-y divide-slate-100 dark:divide-[var(--border)]">
        {sessions.map((s, i) => {
          const running = s.starts_on <= today;
          const className = slots.find((x) => x.class_section_id === s.classId)?.classes?.name ?? "Classe";
          const papers = s.papers
            .filter((p) => (running ? p.eval_date?.slice(0, 10) === today : true))
            .sort((a, b) => `${a.eval_date ?? ""}${a.start_time ?? ""}`.localeCompare(`${b.eval_date ?? ""}${b.start_time ?? ""}`));
          const shown = running ? papers : papers.slice(0, 3);
          return (
            <div key={s.id} className={cn(i > 0 && "pt-5")}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                {running ? "Compositions en cours" : "Compositions à venir"} · {className}
              </p>
              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-50">{s.title || s.period_label || "Compositions"}</p>
              <p className="text-sm text-slate-500">
                {running
                  ? `Vos cours en ${className} sont suspendus jusqu’au ${shortDate(s.ends_on)}.`
                  : `À partir du ${shortDate(s.starts_on)} : vos cours en ${className} seront suspendus.`}
              </p>
              {running && shown.length === 0 ? <p className="mt-2 text-sm text-slate-500">Pas d’épreuve aujourd’hui.</p> : null}
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {shown.map((p) => {
                  const start = p.start_time ? timeToMinutes(p.start_time) : 0;
                  const end = p.end_time ? timeToMinutes(p.end_time) : 0;
                  const isToday = p.eval_date?.slice(0, 10) === today;
                  const live = isToday && nowMin >= start && nowMin < end;
                  const done = isToday && nowMin >= end;
                  const mine = mySubjects.has(p.subjectName);
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2",
                        live ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-amber-50/70 dark:bg-amber-500/10",
                      )}
                    >
                      <span className={cn("w-12 shrink-0 text-xs font-bold tabular-nums", live ? "text-emerald-700" : "text-slate-900 dark:text-slate-100")}>
                        {running ? timeFr(p.start_time) : p.eval_date ? shortDay(p.eval_date) : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", mine ? "font-bold" : "font-semibold", done ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100")}>
                          {p.subjectName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {timeFr(p.start_time)} – {timeFr(p.end_time)}
                          {mine ? " · votre matière" : ""}
                        </span>
                      </span>
                      {live ? <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">EN COURS</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <Link
        to="/mon-emploi-du-temps"
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white transition hover:bg-brand-800"
      >
        Voir l’emploi du temps
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

function BannerTile({ label, value, hint, to }: { label: string; value: string; hint: string; to?: string }) {
  const body = (
    <>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white lg:text-[1.75rem]">{value}</p>
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

function NowCard({
  live,
  upcoming,
  nowMin,
  todayCount,
  nextDay,
  due,
}: {
  live?: Lesson;
  upcoming?: Lesson;
  nowMin: number;
  todayCount: number;
  nextDay: { date: string; first: { start_time: string; matieres: { name: string } | null; classes: { name: string } | null }; count: number } | null;
  due: { done: number; total: number };
}) {
  const card = "rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25";
  const lesson = live ?? upcoming;
  if (lesson) {
    const action = nextAction(lesson);
    const start = timeToMinutes(lesson.start);
    const end = timeToMinutes(lesson.end);
    const progress = live ? Math.min(100, Math.max(0, ((nowMin - start) / (end - start)) * 100)) : 0;
    const inMin = start - nowMin;
    return (
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
              live ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800",
            )}
          >
            <Clock className="h-3 w-3" />
            {live ? "En cours" : "Prochain cours"}
          </span>
          <span className="text-xs font-semibold text-slate-500">
            {live ? `fin à ${timeFr(lesson.end)}` : inMin < 60 ? `dans ${inMin} min` : `à ${timeFr(lesson.start)}`}
          </span>
        </div>
        <p className="mt-3 truncate text-xl font-bold text-slate-900">
          {lesson.subjectName} · {lesson.className}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {lessonHours(lesson)}
          {lesson.room ? ` · Salle ${lesson.room.replace(/^salle\s*/i, "")}` : ""} · {lesson.studentCount} élèves
        </p>
        {live ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-slate-100">
            <div className="h-full rounded-sm bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        <Link
          to={lessonPath(lesson, action?.tab)}
          className="mt-4 flex h-10 items-center justify-center gap-2 rounded-md bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          {action?.tab === "cahier" ? <BookOpenCheck className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
          {live ? action?.label ?? "Ouvrir le cours" : "Préparer le cours"}
        </Link>
      </div>
    );
  }
  if (todayCount > 0) {
    return (
      <div className={card}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
          <Check className="h-3 w-3" />
          Journée terminée
        </span>
        <p className="mt-3 text-xl font-bold text-slate-900">
          {due.done === due.total ? "Tout est fait. Bravo !" : `${due.total - due.done} tâche${due.total - due.done > 1 ? "s" : ""} à terminer`}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {due.done} sur {due.total} appels et cahiers remplis aujourd’hui.
        </p>
      </div>
    );
  }
  return (
    <div className={card}>
      <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
        <CalendarDays className="h-3 w-3" />
        Pas de cours aujourd’hui
      </span>
      {nextDay ? (
        <>
          <p className="mt-3 text-xl font-bold text-slate-900">
            {capitalize(format(new Date(`${nextDay.date}T12:00:00`), "EEEE", { locale: fr }))} à {timeFr(nextDay.first.start_time)}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {nextDay.first.matieres?.name} · {nextDay.first.classes?.name} — {nextDay.count} cours ce jour-là
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Aucun cours prévu cette semaine.</p>
      )}
    </div>
  );
}

function JobChip({ label, state, due }: { label: string; state: JobState; due: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold",
        state === "done"
          ? "bg-emerald-50 text-emerald-700"
          : due
            ? "bg-amber-50 text-amber-800"
            : "bg-slate-100 text-slate-500",
      )}
    >
      {state === "done" ? <Check className="h-3 w-3" /> : null}
      {label}
      {state === "done" ? "" : state === "partial" ? " commencé" : due ? " à faire" : ""}
    </span>
  );
}

function LessonRow({ lesson: l, nowMin }: { lesson: Lesson; nowMin: number }) {
  const action = nextAction(l);
  const complete = !action && l.timing !== "upcoming";
  const live = l.timing === "live";
  const start = timeToMinutes(l.start);
  return (
    <li className="relative flex gap-4">
      <div className="w-16 shrink-0 pt-3 text-right">
        <p className={cn("text-sm font-bold tabular-nums", live ? "text-emerald-700" : "text-slate-900 dark:text-slate-100")}>{timeFr(l.start)}</p>
        <p className="text-xs tabular-nums text-slate-400">{timeFr(l.end)}</p>
      </div>
      <span
        className={cn(
          "relative z-10 mt-4 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-slate-50 dark:ring-[var(--bg)]",
          complete ? "bg-emerald-500" : live ? "bg-emerald-500 animate-pulse" : l.timing === "over" ? "bg-amber-500" : "border-2 border-slate-300 bg-white dark:bg-[var(--surface)]",
        )}
      />
      <Link
        to={lessonPath(l, action?.tab)}
        className={cn(
          "flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-lg border bg-white p-4 transition hover:shadow-md dark:bg-[var(--surface)]",
          live ? "border-emerald-400 ring-2 ring-emerald-400/20" : "border-slate-200 hover:border-brand-300 dark:border-[var(--border)]",
          l.timing === "over" && complete && "opacity-75",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-bold text-slate-900 dark:text-slate-50">
              {l.subjectName} · {l.className}
            </span>
            {live ? <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">En cours</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {l.room ? `Salle ${l.room.replace(/^salle\s*/i, "")} · ` : ""}
            {l.studentCount} élèves
            {l.timing === "upcoming" && start - nowMin <= 90 ? ` · dans ${start - nowMin} min` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <JobChip label="Appel" state={l.appel} due={l.appelDue} />
            <JobChip label="Cahier" state={l.cahier} due={l.cahierDue} />
          </div>
        </div>
        {action ? (
          <span
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold",
              action.primary
                ? "bg-brand-700 text-white"
                : "border border-slate-200 text-slate-700 dark:border-[var(--border)] dark:text-slate-200",
            )}
          >
            {action.label}
            <ArrowRight className="h-4 w-4" />
          </span>
        ) : (
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
            <Check className="h-4 w-4" />
            Complet
          </span>
        )}
      </Link>
    </li>
  );
}

function Shortcut({ to, icon: Icon, label, badge }: { to: string; icon: typeof Clock; label: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="relative flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-3.5 text-sm font-semibold text-slate-800 transition hover:border-brand-300 hover:shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-slate-100"
    >
      <Icon className="h-5 w-5 text-brand-700 dark:text-brand-300" />
      {label}
      {badge ? (
        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-md bg-rose-500 px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
