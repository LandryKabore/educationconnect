import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { CalendarClock, ChevronRight, Download, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import { computeScheduleFocus } from "@/lib/timetableSchedule";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { subjectSwatch } from "@/lib/subjectColors";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { cn, personName } from "@/lib/utils";
import { todayDow, useNow, useWeekLayout } from "@/lib/weekGrid";
import { lessonPath } from "@/hooks/useTeacherLessons";
import { EmptyState } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";

type SlotRow = TimetableSlot & {
  matieres: { name: string } | null;
  classes: { name: string } | null;
};

const DAYS = [
  { n: 1, long: "Lundi" },
  { n: 2, long: "Mardi" },
  { n: 3, long: "Mercredi" },
  { n: 4, long: "Jeudi" },
  { n: 5, long: "Vendredi" },
  { n: 6, long: "Samedi" },
];
const HOUR_PX = 72;
const hhmm = (t: string) => t.slice(0, 5);
const iso = (d: Date) => format(d, "yyyy-MM-dd");

function roomLabel(room: string | null) {
  const r = room?.trim();
  if (!r) return null;
  return /^salle/i.test(r) ? r : `Salle ${r}`;
}

/** Date of a weekday in the week shown (next week on Sundays). */
function dateOfDay(now: Date, dow: number) {
  const base = now.getDay() === 0 ? addDays(now, 1) : now;
  return iso(addDays(startOfWeek(base, { weekStartsOn: 1 }), dow - 1));
}

/** Teacher timetable: the week as a grid of lessons (by class), each one opening its lesson screen. */
export default function MonEmploiDuTempsProf() {
  const { user, profile, schoolId, schools } = useAuth();
  const qc = useQueryClient();
  const school = schools.find((s) => s.id === schoolId);
  const [exporting, setExporting] = useState(false);
  const now = useNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayDow(now);

  // live updates when the school changes the timetable
  useEffect(() => {
    if (!schoolId || !user?.id) return;
    const channel = supabase
      .channel(`edt-teacher:${user.id}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "creneaux_edt" }, () => {
        void qc.invalidateQueries({ queryKey: ["mon-edt-prof", user.id] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [schoolId, user?.id, qc]);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["mon-edt-prof", user?.id],
    enabled: !!user?.id && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, matieres(name), classes!inner(name, school_id)")
        .eq("teacher_id", user!.id)
        .eq("classes.school_id", schoolId!)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as SlotRow[];
    },
  });

  const { byDay, bounds } = useWeekLayout(slots);
  const focus = useMemo(() => computeScheduleFocus(slots, now), [slots, now]);
  const weeklyMinutes = slots.reduce((n, s) => n + timeToMinutes(s.end_time) - timeToMinutes(s.start_time), 0);
  const classCount = new Set(slots.map((s) => s.class_section_id)).size;
  const todayCount = byDay.get(today)?.length ?? 0;

  const handleDownload = () => {
    if (slots.length === 0) {
      toast.message("Aucun créneau à exporter");
      return;
    }
    setExporting(true);
    try {
      const teacherName = profile ? personName(profile.first_name, profile.last_name) || "Enseignant" : "Enseignant";
      const doc = generateEmploiDuTempsPdf({
        schoolName: school?.name ?? "École",
        className: "Mes cours",
        extraLine: `Enseignant : ${teacherName}`,
        slots: slots.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          subjectName: s.matieres?.name ?? "Matière",
          teacherName: s.classes?.name ?? null,
          room: s.room,
        })),
      });
      const safeName = teacherName.replace(/\s+/g, "-").replace(/[^\w\-àâäéèêëïîôùûüç]/gi, "");
      doc.save(`emploi-du-temps-${safeName || "enseignant"}.pdf`);
      toast.success("Emploi du temps téléchargé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléchargement impossible");
    } finally {
      setExporting(false);
    }
  };

  const focusDate = focus ? (focus.isLaterDay ? dateOfDay(now, focus.slot.day_of_week) : iso(now)) : null;
  const hours = weeklyMinutes / 60;

  return (
    <div>
      <PageBanner
        title="Mon emploi du temps"
        subtitle="Vos cours du lundi au samedi, mis à jour en direct. Touchez un cours pour l’ouvrir."
        actions={
          <button
            type="button"
            disabled={isLoading || slots.length === 0 || exporting}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Export…" : "Télécharger PDF"}
          </button>
        }
        stats={[
          { label: "Cours", value: String(slots.length), hint: "par semaine" },
          {
            label: "Heures",
            value: Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1).replace(".", ",")} h`,
            hint: "par semaine",
          },
          {
            label: "Classes",
            value: String(classCount),
            hint: todayCount ? `${todayCount} cours aujourd’hui` : "pas de cours aujourd’hui",
          },
        ]}
        aside={
          focus && focusDate ? (
            <Link
              to={lessonPath({ slotId: focus.slot.id, date: focusDate })}
              className="block rounded-md bg-[#fff] p-4 text-slate-900 shadow-sm transition hover:shadow-md dark:bg-[var(--surface)] dark:text-slate-100"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" />
                {focus.kind === "current"
                  ? "En ce moment"
                  : focus.isLaterDay
                    ? `Prochain cours · ${focus.dayLabel}`
                    : "Prochain cours"}
                {focus.kind === "current" ? <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> : null}
              </p>
              <p className="mt-2 truncate text-xl font-bold">{focus.slot.classes?.name ?? "Classe"}</p>
              <p className="text-sm text-slate-500">
                {focus.slot.matieres?.name ?? "Cours"} · {hhmm(focus.slot.start_time)} – {hhmm(focus.slot.end_time)}
                {roomLabel(focus.slot.room) ? ` · ${roomLabel(focus.slot.room)}` : ""}
              </p>
              <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
                Ouvrir le cours <ChevronRight className="h-4 w-4" />
              </p>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? (
        <div
          className="h-[36rem] animate-pulse rounded-lg bg-slate-100 dark:bg-[var(--surface-2)]"
          aria-busy="true"
          aria-label="Chargement"
        />
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau planifié pour vous. L’administration peut vous affecter des cours dans l’emploi du temps." />
      ) : (
        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[3.5rem_repeat(6,minmax(0,1fr))] border-b border-slate-200 dark:border-[var(--border)]">
              <span />
              {DAYS.map((d) => {
                const isToday = d.n === today;
                const count = byDay.get(d.n)?.length ?? 0;
                const dayNum = Number(dateOfDay(now, d.n).slice(8, 10));
                return (
                  <div key={d.n} className={cn("px-2 py-3 text-center", isToday && "bg-brand-50 dark:bg-brand-500/10")}>
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isToday ? "text-brand-800 dark:text-brand-300" : "text-slate-900 dark:text-slate-100",
                      )}
                    >
                      {d.long} <span className="font-medium text-slate-400">{dayNum}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isToday ? "Aujourd’hui · " : ""}
                      {count ? `${count} cours` : "—"}
                    </p>
                  </div>
                );
              })}
            </div>

            <WeekBody byDay={byDay} bounds={bounds} today={today} nowMin={nowMin} now={now} />
          </div>
        </section>
      )}
    </div>
  );
}

function WeekBody({
  byDay,
  bounds,
  today,
  nowMin,
  now,
}: {
  byDay: Map<number, SlotRow[]>;
  bounds: { start: number; end: number };
  today: number;
  nowMin: number;
  now: Date;
}) {
  const hours: number[] = [];
  for (let m = bounds.start; m <= bounds.end; m += 60) hours.push(m);
  const height = ((bounds.end - bounds.start) / 60) * HOUR_PX;
  const showNow = today <= 6 && nowMin >= bounds.start && nowMin <= bounds.end;

  return (
    <div className="grid grid-cols-[3.5rem_repeat(6,minmax(0,1fr))]">
      <div className="relative" style={{ height }}>
        {hours.map((m) => (
          <span
            key={m}
            className="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-slate-400"
            style={{ top: ((m - bounds.start) / 60) * HOUR_PX }}
          >
            {m / 60} h
          </span>
        ))}
      </div>
      {DAYS.map((d) => {
        const isToday = d.n === today;
        const date = dateOfDay(now, d.n);
        return (
          <div
            key={d.n}
            className={cn(
              "relative border-l border-slate-100 dark:border-[var(--border)]",
              isToday && "bg-brand-50/50 dark:bg-brand-500/5",
            )}
            style={{ height }}
          >
            {hours.map((m) => (
              <span
                key={m}
                className="absolute inset-x-0 border-t border-dashed border-slate-100 dark:border-white/5"
                style={{ top: ((m - bounds.start) / 60) * HOUR_PX }}
              />
            ))}
            {(byDay.get(d.n) ?? []).map((s) => {
              const start = timeToMinutes(s.start_time);
              const end = timeToMinutes(s.end_time);
              return (
                <LessonPill
                  key={s.id}
                  slot={s}
                  to={lessonPath({ slotId: s.id, date })}
                  top={((start - bounds.start) / 60) * HOUR_PX}
                  height={((end - start) / 60) * HOUR_PX}
                  live={isToday && start <= nowMin && nowMin < end}
                  past={isToday && end <= nowMin}
                />
              );
            })}
            {isToday && showNow ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                style={{ top: ((nowMin - bounds.start) / 60) * HOUR_PX }}
                aria-hidden
              >
                <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="h-0.5 flex-1 bg-rose-500" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** One lesson, coloured by class (a teacher usually teaches one subject, so the class is what changes). */
function LessonPill({
  slot,
  to,
  top,
  height,
  live,
  past,
}: {
  slot: SlotRow;
  to: string;
  top: number;
  height: number;
  live: boolean;
  past: boolean;
}) {
  const swatch = subjectSwatch(slot.classes?.name);
  const room = roomLabel(slot.room);
  const time = `${hhmm(slot.start_time)} – ${hhmm(slot.end_time)}`;
  return (
    <Link
      to={to}
      className={cn(
        "absolute right-1 left-1 z-[3] overflow-hidden rounded-md border-2 px-1.5 py-1 shadow-sm transition hover:z-10 hover:shadow-md",
        swatch.card,
        past && "opacity-55",
        live && "z-10 ring-2 ring-emerald-500 ring-offset-1",
      )}
      style={{ top: top + 2, height: Math.max(height - 4, 24) }}
      title={[slot.classes?.name, slot.matieres?.name, time, room].filter(Boolean).join(" · ")}
    >
      <p className="edt-slot-title truncate text-xs font-bold leading-snug text-slate-900">
        {slot.classes?.name ?? "Classe"}
      </p>
      <p className="edt-slot-body truncate text-[10px] font-medium leading-tight text-slate-700 tabular-nums">{time}</p>
      <p className="edt-slot-body truncate text-[10px] leading-tight text-slate-700">{slot.matieres?.name ?? "Cours"}</p>
      {room ? (
        <p className="edt-slot-muted flex items-center gap-0.5 truncate text-[10px] leading-tight text-slate-600">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {room}
        </p>
      ) : null}
    </Link>
  );
}
