import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
} from "lucide-react";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNow } from "@/lib/weekGrid";
import { iso, lessonHours, useTeacherLessons, useTeacherSlots, type JobState } from "@/hooks/useTeacherLessons";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { PageBanner } from "@/components/PageBanner";
import { EmptyState } from "@/components/ui";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (d: string) => capitalize(format(new Date(`${d}T12:00:00`), "EEEE d MMMM", { locale: fr }));
const shortDay = (d: string) => capitalize(format(new Date(`${d}T12:00:00`), "EEE d MMM", { locale: fr }));

type DayLesson = {
  key: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  start: string;
  end: string;
  room: string | null;
  studentCount: number;
  recorded: number;
  absent: number;
  late: number;
  appel: JobState;
  upcoming: boolean;
};

const rollPath = (classId: string, date: string, subjectId?: string) =>
  `/classes/${classId}/presences?date=${date}${subjectId ? `&matiere=${subjectId}` : ""}`;

const navBtn =
  "grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 hover:bg-slate-50 dark:border-[var(--border)] dark:hover:bg-[var(--surface-2)]";

/**
 * Teacher « Présences »: the roll calls of one day, taken from the timetable (one per lesson),
 * the late ones of the last days, and a way to call the roll of any class (replacement, extra lesson).
 */
export default function MesPresencesProf() {
  const { user } = useAuth();
  const now = useNow();
  const today = iso(now);
  const [params, setParams] = useSearchParams();
  const paramDate = params.get("date");
  const [date, setDateState] = useState(paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) ? paramDate : today);
  const setDate = (d: string) => {
    if (!d) return;
    setDateState(d);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (d === iso(new Date())) p.delete("date");
        else p.set("date", d);
        return p;
      },
      { replace: true },
    );
  };
  const shift = (days: number) => {
    let d = addDays(new Date(`${date}T12:00:00`), days);
    if (d.getDay() === 0) d = addDays(d, days > 0 ? 1 : -1); // no lessons on Sunday
    setDate(iso(d));
  };

  const slotsQ = useTeacherSlots();
  const slots = useMemo(() => slotsQ.data ?? [], [slotsQ.data]);
  const { lateLessons } = useTeacherLessons(now);

  // every class the teacher teaches (also those not in the timetable)
  const { data: classes = [] } = useQuery({
    queryKey: ["teacher-presence-classes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, classes(id, name, grade_level)")
        .eq("teacher_id", user!.id);
      if (error) throw error;
      const map = new Map<string, { id: string; name: string; grade_level: string | null }>();
      for (const row of data ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          classes: { id: string; name: string; grade_level: string | null } | null;
        };
        const id = r.classes?.id ?? r.class_section_id;
        if (!map.has(id)) map.set(id, { id, name: r.classes?.name ?? "Classe", grade_level: r.classes?.grade_level ?? null });
      }
      return sortClassesByProgression([...map.values()]);
    },
  });

  const daySlots = useMemo(() => {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if (dow === 0) return [];
    return slots.filter((s) => s.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [slots, date]);

  const classIds = [...new Set(daySlots.map((s) => s.class_section_id))].sort();
  const subjectIds = [...new Set(daySlots.map((s) => s.subject_id))].sort();

  type Row = { class_section_id: string; subject_id: string; status: string };
  const dayQ = useQuery({
    queryKey: ["teacher-presences-day", user?.id, date, classIds.join(","), subjectIds.join(",")],
    enabled: !!user?.id && slotsQ.isSuccess,
    queryFn: async () => {
      const students: Record<string, number> = {};
      const rows: Row[] = [];
      if (classIds.length === 0) return { students, rows };
      const { data: insc, error: e1 } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .in("class_section_id", classIds)
        .eq("status", "active");
      if (e1) throw e1;
      for (const r of insc ?? []) {
        const id = (r as { class_section_id: string }).class_section_id;
        students[id] = (students[id] ?? 0) + 1;
      }
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("presences")
          .select("class_section_id, subject_id, status")
          .in("class_section_id", classIds)
          .in("subject_id", subjectIds)
          .eq("date", date)
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as Row[]));
        if (!data || data.length < 1000) break;
      }
      return { students, rows };
    },
  });

  const lessons = useMemo((): DayLesson[] => {
    const st = dayQ.data;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return daySlots.map((s) => {
      const rows = (st?.rows ?? []).filter((r) => r.class_section_id === s.class_section_id && r.subject_id === s.subject_id);
      const studentCount = st?.students[s.class_section_id] ?? 0;
      const recorded = rows.length;
      return {
        key: s.id,
        classId: s.class_section_id,
        className: s.classes?.name ?? "Classe",
        subjectId: s.subject_id,
        subjectName: s.matieres?.name ?? "Cours",
        start: s.start_time,
        end: s.end_time,
        room: s.room,
        studentCount,
        recorded,
        absent: rows.filter((r) => r.status === "absent").length,
        late: rows.filter((r) => r.status === "late").length,
        appel: studentCount > 0 && recorded >= studentCount ? "done" : recorded > 0 ? "partial" : "todo",
        upcoming: date > today || (date === today && nowMin < timeToMinutes(s.start_time)),
      };
    });
  }, [dayQ.data, daySlots, date, today, now]);

  const done = lessons.filter((l) => l.appel === "done").length;
  const toDo = lessons.filter((l) => l.appel !== "done" && !l.upcoming).length;
  const lateRollCalls = lateLessons.filter((l) => l.appelDue && l.appel !== "done" && l.date < today);

  const nextLessonDay = useMemo(() => {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(new Date(`${date}T12:00:00`), i);
      if (d.getDay() !== 0 && slots.some((s) => s.day_of_week === d.getDay())) return iso(d);
    }
    return null;
  }, [slots, date]);

  const isToday = date === today;
  const loading = slotsQ.isLoading || dayQ.isLoading;

  return (
    <div>
      <PageBanner
        title="Présences"
        subtitle={`${isToday ? "Aujourd’hui, " : ""}${dayLabel(date).toLowerCase()} — un appel par cours de votre emploi du temps.`}
        stats={[
          { label: "Cours", value: String(lessons.length), hint: isToday ? "aujourd’hui" : "ce jour-là" },
          { label: "Appels faits", value: String(done), hint: `sur ${lessons.length}` },
          { label: "À faire", value: String(toDo), hint: toDo ? "cours commencés" : "rien en attente" },
        ]}
        aside={
          <div className="rounded-md bg-[#fff] p-4 text-slate-900 shadow-sm dark:bg-[var(--surface)] dark:text-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jour de l’appel</p>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => shift(-1)} aria-label="Jour précédent" className={navBtn}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <label className="relative min-w-0 flex-1">
                <span className="block truncate rounded-md border border-slate-200 px-3 py-2 text-center text-sm font-semibold dark:border-[var(--border)]">
                  {dayLabel(date)}
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Choisir une date"
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <button type="button" onClick={() => shift(1)} aria-label="Jour suivant" className={navBtn}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!isToday ? (
              <button
                type="button"
                onClick={() => setDate(iso(new Date()))}
                className="mt-2 w-full rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
              >
                Revenir à aujourd’hui
              </button>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Touchez la date pour en choisir une autre.</p>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isToday && lateRollCalls.length > 0 ? (
            <section className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5">
              <h2 className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-500/30 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                {lateRollCalls.length} appel{lateRollCalls.length > 1 ? "s" : ""} en retard
                <span className="font-normal text-amber-800/80 dark:text-amber-200/70">· 7 derniers jours</span>
              </h2>
              <ul className="divide-y divide-amber-200/70 dark:divide-amber-500/20">
                {lateRollCalls.slice(0, 6).map((l) => (
                  <li key={l.key}>
                    <Link
                      to={rollPath(l.classId, l.date, l.subjectId)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-amber-100/60 dark:hover:bg-amber-500/10"
                    >
                      <span className="w-24 shrink-0 font-semibold text-amber-900 dark:text-amber-200">{shortDay(l.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">
                        {l.className} · {l.subjectName} <span className="text-slate-500">· {lessonHours(l)}</span>
                      </span>
                      <span className="hidden shrink-0 font-semibold text-amber-900 sm:inline dark:text-amber-200">Faire l’appel</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-amber-700" />
                    </Link>
                  </li>
                ))}
              </ul>
              {lateRollCalls.length > 6 ? (
                <Link
                  to="/a-faire"
                  className="block border-t border-amber-200 px-4 py-2.5 text-center text-sm font-semibold text-amber-900 hover:bg-amber-100/60 dark:border-amber-500/30 dark:text-amber-200 dark:hover:bg-amber-500/10"
                >
                  Voir les {lateRollCalls.length} appels dans « À faire »
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]">
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900 dark:border-[var(--border)] dark:text-slate-100">
              <CalendarDays className="h-4 w-4 text-brand-700 dark:text-brand-300" />
              Cours {isToday ? "d’aujourd’hui" : `du ${dayLabel(date).toLowerCase()}`}
            </h2>
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-500">Chargement…</p>
            ) : lessons.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="font-semibold text-slate-800 dark:text-slate-100">Pas de cours ce jour dans votre emploi du temps</p>
                <p className="mt-1 text-sm text-slate-500">
                  Pour un remplacement ou un cours rattrapé, choisissez la classe dans « Autre classe ».
                </p>
                {nextLessonDay ? (
                  <button
                    type="button"
                    onClick={() => setDate(nextLessonDay)}
                    className="mt-4 inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-slate-50 dark:border-[var(--border)] dark:text-brand-300 dark:hover:bg-[var(--surface-2)]"
                  >
                    Prochains cours : {dayLabel(nextLessonDay).toLowerCase()}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-[var(--border)]">
                {lessons.map((l) => (
                  <li key={l.key}>
                    <LessonRow lesson={l} date={date} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="rounded-md border border-slate-200 bg-white lg:self-start dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-[var(--border)]">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Autre classe</h2>
            <p className="text-xs text-slate-500">Remplacement, cours déplacé ou rattrapé</p>
          </div>
          {classes.length === 0 ? (
            <div className="p-4">
              <EmptyState message="Aucune classe assignée." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[var(--border)]">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    to={rollPath(c.id, date)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900 dark:text-slate-100">{c.name}</span>
                      {c.grade_level ? <span className="block text-xs text-slate-500">{c.grade_level}</span> : null}
                    </span>
                    <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">Appel</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function LessonRow({ lesson: l, date }: { lesson: DayLesson; date: string }) {
  const present = Math.max(0, l.recorded - l.absent - l.late);
  return (
    <Link
      to={rollPath(l.classId, date, l.subjectId)}
      className="group flex flex-col gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:flex-row sm:items-center dark:hover:bg-[var(--surface-2)]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="w-14 shrink-0 text-center">
          <p className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{l.start.slice(0, 5)}</p>
          <p className="text-xs tabular-nums text-slate-500">{l.end.slice(0, 5)}</p>
        </div>
        <div
          className={cn(
            "h-10 w-1 shrink-0 rounded-full",
            l.appel === "done" ? "bg-emerald-500" : l.upcoming ? "bg-slate-200 dark:bg-slate-700" : "bg-amber-400",
          )}
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {l.className} <span className="font-normal text-slate-500">· {l.subjectName}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {l.studentCount} élève{l.studentCount > 1 ? "s" : ""}
            </span>
            {l.room ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {l.room}
              </span>
            ) : null}
            {l.recorded > 0 ? (
              <span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {present} présent{present > 1 ? "s" : ""}
                </span>
                {" · "}
                <span className={cn("font-semibold", l.absent ? "text-rose-700 dark:text-rose-400" : "")}>
                  {l.absent} absent{l.absent > 1 ? "s" : ""}
                </span>
                {l.late ? (
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {" · "}
                    {l.late} retard{l.late > 1 ? "s" : ""}
                  </span>
                ) : null}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-[4.5rem] sm:pl-0">
        {l.appel === "done" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Appel fait
          </span>
        ) : l.upcoming ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300">
            <Clock className="h-4 w-4" />
            Plus tard
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white group-hover:bg-brand-800">
            {l.appel === "partial" ? "Terminer l’appel" : "Faire l’appel"}
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </Link>
  );
}
