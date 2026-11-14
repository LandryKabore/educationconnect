import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import { subjectSwatch } from "@/lib/subjectColors";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { cn, fullName, personName } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { todayDow, useNow, useWeekLayout } from "@/lib/weekGrid";

export type Slot = TimetableSlot & {
  matieres: { name: string };
  profils: { first_name: string; last_name: string } | null;
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


function hhmm(t: string) {
  return t.slice(0, 5);
}

function roomLabel(room: string | null) {
  const r = room?.trim();
  if (!r) return null;
  return /^salle/i.test(r) ? r : `Salle ${r}`;
}


export default function MonEmploiDuTemps() {
  const { user, profile, schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const { pending, pendingCount, markSeen } = useEdtPendingChanges();
  const [showChanges, setShowChanges] = useState(false);
  const [exporting, setExporting] = useState(false);
  const now = useNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayDow(now);

  useEffect(() => {
    if (pendingCount > 0) setShowChanges(true);
  }, [pendingCount]);

  const { data: enrollmentMeta } = useQuery({
    queryKey: ["mon-inscription-edt", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as { class_section_id: string; classes: { name: string } | null } | null;
    },
  });

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["mon-edt", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (!enrollment) return [];
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, matieres(name), profils(first_name, last_name)")
        .eq("class_section_id", (enrollment as { class_section_id: string }).class_section_id)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as Slot[];
    },
  });

  const changedIds = useMemo(
    () => new Set(pending.filter((c) => c.kind !== "removed").map((c) => c.slotId)),
    [pending],
  );

  const { byDay, bounds } = useWeekLayout(slots);

  const dismissChanges = () => {
    markSeen();
    setShowChanges(false);
  };

  const handleDownload = () => {
    if (slots.length === 0) {
      toast.message("Aucun créneau à exporter");
      return;
    }
    setExporting(true);
    try {
      const studentName = profile ? personName(profile.first_name, profile.last_name) || "Élève" : "Élève";
      const doc = generateEmploiDuTempsPdf({
        schoolName: school?.name ?? "École",
        studentName,
        className: enrollmentMeta?.classes?.name ?? "—",
        slots: slots.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          subjectName: s.matieres?.name ?? "Matière",
          teacherName: s.profils ? fullName(s.profils.first_name, s.profils.last_name) : null,
          room: s.room,
        })),
      });
      const safeClass = (enrollmentMeta?.classes?.name ?? "classe")
        .replace(/\s+/g, "-")
        .replace(/[^\w\-àâäéèêëïîôùûüç]/gi, "");
      doc.save(`emploi-du-temps-${safeClass}.pdf`);
      toast.success("Emploi du temps téléchargé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléchargement impossible");
    } finally {
      setExporting(false);
    }
  };

  const className = enrollmentMeta?.classes?.name;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">Mon emploi du temps</h1>
          <p className="mt-1 text-sm text-slate-500">
            {className ? `Classe ${className} · ` : ""}du lundi au samedi · mis à jour en direct
          </p>
        </div>
        <button
          type="button"
          disabled={isLoading || slots.length === 0 || exporting}
          onClick={handleDownload}
          className="inline-flex items-center gap-2 self-start rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 md:self-auto dark:border-white/10 dark:text-slate-200"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Export…" : "Télécharger PDF"}
        </button>
      </header>

      {showChanges && pending.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-brand-500/40 dark:bg-brand-950/30">
          <div className="flex gap-3">
            <span className="flex shrink-0 pt-0.5 text-brand-700 dark:text-brand-300">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">Nouveautés sur ton emploi du temps</p>
              <ul className="mt-1.5 space-y-1">
                {pending.map((c) => (
                  <li key={c.id} className="text-sm text-slate-800 dark:text-slate-100">
                    <span className="font-semibold text-brand-700 dark:text-brand-300">
                      {c.kind === "added" ? "Ajouté" : c.kind === "removed" ? "Supprimé" : "Modifié"} ·{" "}
                    </span>
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissChanges}
            className="shrink-0 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            J’ai vu
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="h-[36rem] animate-pulse rounded-lg bg-slate-100" aria-busy="true" aria-label="Chargement" />
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau planifié." />
      ) : (
        <WeekGrid byDay={byDay} bounds={bounds} today={today} nowMin={nowMin} changedIds={changedIds} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */


export function WeekGrid({
  byDay,
  bounds,
  today,
  nowMin,
  changedIds,
}: {
  byDay: Map<number, Slot[]>;
  bounds: { start: number; end: number };
  today: number;
  nowMin: number;
  changedIds: Set<string>;
}) {
  const hours: number[] = [];
  for (let m = bounds.start; m <= bounds.end; m += 60) hours.push(m);
  const height = ((bounds.end - bounds.start) / 60) * HOUR_PX;
  const showNow = today <= 6 && nowMin >= bounds.start && nowMin <= bounds.end;

  return (
    <section className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white shadow-sm dark:border-white/10">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[3.5rem_repeat(6,minmax(0,1fr))] border-b border-slate-200 dark:border-white/10">
          <span />
          {DAYS.map((d) => {
            const isToday = d.n === today;
            const count = byDay.get(d.n)?.length ?? 0;
            return (
              <div key={d.n} className={cn("px-2 py-3 text-center", isToday && "bg-brand-50 dark:bg-brand-500/10")}>
                <p className={cn("text-sm font-bold", isToday ? "text-brand-800 dark:text-brand-300" : "text-slate-900")}>
                  {d.long}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isToday ? "Aujourd’hui · " : ""}
                  {count ? `${count} cours` : "—"}
                </p>
              </div>
            );
          })}
        </div>

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
            return (
              <div
                key={d.n}
                className={cn(
                  "relative border-l border-slate-100 dark:border-white/5",
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
                {(byDay.get(d.n) ?? []).map((s) => (
                  <CoursePill
                    key={s.id}
                    slot={s}
                    top={((timeToMinutes(s.start_time) - bounds.start) / 60) * HOUR_PX}
                    height={((timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60) * HOUR_PX}
                    live={isToday && timeToMinutes(s.start_time) <= nowMin && nowMin < timeToMinutes(s.end_time)}
                    past={isToday && timeToMinutes(s.end_time) <= nowMin}
                    changed={changedIds.has(s.id)}
                  />
                ))}
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
      </div>
    </section>
  );
}

/** Same pill as the shared timetable grid: full coloured border, subject, time, teacher, room. */
function CoursePill({
  slot,
  top,
  height,
  live,
  past,
  changed,
}: {
  slot: Slot;
  top: number;
  height: number;
  live: boolean;
  past: boolean;
  changed: boolean;
}) {
  const swatch = subjectSwatch(slot.matieres?.name);
  const teacher = slot.profils ? fullName(slot.profils.first_name, slot.profils.last_name) : null;
  const room = roomLabel(slot.room);
  const time = `${hhmm(slot.start_time)} – ${hhmm(slot.end_time)}`;
  return (
    <div
      className={cn(
        "absolute right-1 left-1 z-[3] overflow-hidden rounded-md border-2 px-1.5 py-1 shadow-sm",
        swatch.card,
        past && "opacity-55",
        live && "z-10 ring-2 ring-emerald-500 ring-offset-1",
        !live && changed && "ring-2 ring-brand-500 ring-offset-1 animate-pulse",
      )}
      style={{ top: top + 2, height: Math.max(height - 4, 24) }}
      title={[slot.matieres?.name, time, teacher, room].filter(Boolean).join(" · ")}
    >
      <p className="edt-slot-title truncate text-xs font-bold leading-snug text-slate-900">
        {slot.matieres?.name ?? "Cours"}
      </p>
      <p className="edt-slot-body truncate text-[10px] font-medium leading-tight text-slate-700 tabular-nums">{time}</p>
      {teacher ? (
        <p className="edt-slot-body truncate text-[10px] leading-tight text-slate-700">{teacher}</p>
      ) : null}
      {room ? <p className="edt-slot-muted truncate text-[10px] leading-tight text-slate-600">{room}</p> : null}
    </div>
  );
}
