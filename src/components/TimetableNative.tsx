import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, Clock, Coffee, MapPin, User } from "lucide-react";
import { dbDayOfWeek } from "@/lib/timetableSchedule";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { formatRoomLabel } from "@/lib/timetableLayout";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";
import type { TimetableGridSlot } from "@/components/TimetableGrid";

/** A gap this long between two lessons is shown as a « Pause » row (same threshold as iOS). */
const PAUSE_GAP_MIN = 90;
const WEEK_RANGE = [-2, -1, 0, 1, 2] as const;
const SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

const card =
  "rounded-2xl border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]";

const clock = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
};

type Block =
  | { kind: "course"; id: string; slot: TimetableGridSlot; start: number; end: number }
  | { kind: "pause"; id: string; start: number; end: number };

function buildTimeline(items: TimetableGridSlot[]): Block[] {
  const blocks: Block[] = [];
  items.forEach((slot, i) => {
    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    if (i > 0) {
      const prevEnd = timeToMinutes(items[i - 1].end_time);
      if (start - prevEnd >= PAUSE_GAP_MIN) {
        blocks.push({ kind: "pause", id: `pause-${prevEnd}-${start}`, start: prevEnd, end: start });
      }
    }
    blocks.push({ kind: "course", id: slot.id, slot, start, end });
  });
  return blocks;
}

function weekDays(reference: Date, today: Date, markToday: boolean) {
  const monday = startOfWeek(reference, { weekStartsOn: 1 });
  return SHORT.map((short, i) => {
    const date = addDays(monday, i);
    return {
      day: i + 1,
      short,
      number: date.getDate(),
      longLabel: format(date, "EEEE d MMM", { locale: fr }).replace(/^./, (c) => c.toUpperCase()),
      isToday: markToday && format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd"),
    };
  });
}

function weekOption(offset: number, today: Date) {
  const monday = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), offset);
  const saturday = addDays(monday, 5);
  const sameMonth = format(monday, "MMM", { locale: fr }) === format(saturday, "MMM", { locale: fr });
  const range = sameMonth
    ? `${format(monday, "d")}–${format(saturday, "d MMM", { locale: fr })}`
    : `${format(monday, "d MMM", { locale: fr })} – ${format(saturday, "d MMM", { locale: fr })}`;
  const badge =
    offset === 0
      ? "Cette sem."
      : offset === -1
        ? "Sem. passée"
        : offset === 1
          ? "Sem. proch."
          : offset < 0
            ? `Il y a ${-offset} sem.`
            : `Dans ${offset} sem.`;
  return { offset, badge, range };
}

/**
 * Android app « Mon emploi du temps » — same screen as the native iOS TimetableView:
 * Jour / Semaine switch, day strip, live « En cours / Prochain » summary,
 * timeline with pauses, week list. Refreshed every 30 s.
 */
export function TimetableNative({
  slots,
  changedIds = [],
}: {
  slots: TimetableGridSlot[];
  /** Slots added / modified since the last visit. */
  changedIds?: string[];
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const todayDow = dbDayOfWeek(now);
  const defaultDay = todayDow === 7 ? 1 : todayDow;
  const [scope, setScope] = useState<"day" | "week">("day");
  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [weekOffset, setWeekOffset] = useState(0);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = useMemo(
    () => [...slots].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)),
    [slots],
  );
  const slotsOfDay = (d: number) => sorted.filter((s) => s.day_of_week === d);
  const daySlots = slotsOfDay(selectedDay);
  const timeline = useMemo(() => buildTimeline(daySlots), [daySlots]);
  const days = weekDays(addWeeks(now, weekOffset), now, weekOffset === 0);
  const stripDays = weekDays(now, now, true);
  const options = WEEK_RANGE.map((o) => weekOption(o, now));
  const viewingToday = selectedDay === todayDow && todayDow !== 7;

  const isLive = (s: TimetableGridSlot) =>
    timeToMinutes(s.start_time) <= nowMin && nowMin < timeToMinutes(s.end_time);
  const todaySlots = slotsOfDay(todayDow);
  const nextToday = todaySlots.find((s) => timeToMinutes(s.start_time) > nowMin);
  const live = viewingToday ? daySlots.find(isLive) : undefined;
  const upcoming = viewingToday ? daySlots.find((s) => timeToMinutes(s.start_time) > nowMin) : undefined;
  const dayWindow =
    daySlots.length > 0
      ? `${clock(timeToMinutes(daySlots[0].start_time))} – ${clock(timeToMinutes(daySlots[daySlots.length - 1].end_time))}`
      : null;
  const selectedLabel = stripDays.find((d) => d.day === selectedDay);
  const weekTotal = sorted.filter((s) => s.day_of_week >= 1 && s.day_of_week <= 6).length;
  const selectedOption = options.find((o) => o.offset === weekOffset);

  const tab = (active: boolean) =>
    cn(
      "min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition-colors",
      active
        ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
        : "text-slate-700 dark:text-slate-300",
    );

  const CourseCard = ({ slot, liveNow, next }: { slot: TimetableGridSlot; liveNow: boolean; next: boolean }) => {
    const sw = subjectSwatch(slot.subjectName);
    const room = formatRoomLabel(slot.room);
    const changed = changedIds.includes(slot.id);
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", liveNow ? "bg-emerald-600" : sw.dot)} aria-hidden />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{slot.subjectName}</span>
          {liveNow ? (
            <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">En cours</span>
          ) : next ? (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
              Prochain
            </span>
          ) : null}
          {changed ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              Modifié
            </span>
          ) : null}
        </div>
        {slot.teacherName || room ? (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
            {slot.teacherName ? (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" aria-hidden />
                {slot.teacherName}
              </span>
            ) : null}
            {room ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {room}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Affichage" className="flex gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
        {(["day", "week"] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={tab(scope === s)}>
            {s === "day" ? "Jour" : "Semaine"}
          </button>
        ))}
      </div>

      {scope === "day" ? (
        <>
          <div className="grid grid-cols-6 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
            {stripDays.map((d) => {
              const selected = d.day === selectedDay;
              const has = slots.some((s) => s.day_of_week === d.day);
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setSelectedDay(d.day)}
                  aria-pressed={selected}
                  aria-label={d.longLabel + (d.isToday ? " (aujourd’hui)" : "")}
                  className={cn(
                    "flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors",
                    selected ? "bg-white shadow-sm dark:bg-[var(--surface)]" : "",
                    d.isToday && "ring-1 ring-emerald-600",
                  )}
                >
                  <span className={cn("text-[11px] font-bold", d.isToday ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300")}>
                    {d.short}
                  </span>
                  <span className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{d.number}</span>
                  {d.isToday ? (
                    <span className="rounded-full bg-emerald-700 px-1.5 text-[9px] font-bold text-white">AUJ</span>
                  ) : (
                    <span className={cn("h-1.5 w-1.5 rounded-full", has ? "bg-brand-600" : "bg-transparent")} aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          <div className={cn(card, "flex items-center gap-3.5 p-4")}>
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", live ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-[var(--surface-2)] dark:text-slate-200")}>
              {live ? <Clock className="h-6 w-6" /> : <CalendarClock className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <span>
                  {selectedLabel ? `${selectedLabel.longLabel}${selectedLabel.isToday ? " · aujourd’hui" : ""}` : ""}
                </span>
                {viewingToday ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums text-slate-800 dark:bg-[var(--surface-2)] dark:text-slate-100">
                    {clock(nowMin)}
                  </span>
                ) : null}
              </p>
              {daySlots.length === 0 ? (
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {viewingToday ? "Aucun cours aujourd’hui" : "Aucun cours"}
                </p>
              ) : live ? (
                <>
                  <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">En cours · {live.subjectName}</p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    {clock(timeToMinutes(live.start_time))} – {clock(timeToMinutes(live.end_time))}
                  </p>
                </>
              ) : upcoming ? (
                <>
                  <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">Prochain · {upcoming.subjectName}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">À {clock(timeToMinutes(upcoming.start_time))}</p>
                </>
              ) : viewingToday ? (
                <>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Journée terminée</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {daySlots.length} cours · {dayWindow}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{daySlots.length} cours</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{dayWindow}</p>
                </>
              )}
            </div>
          </div>

          {timeline.length === 0 ? (
            <div className={cn(card, "px-4 py-8 text-center")}>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Pas de cours ce jour</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Choisis un autre jour ou regarde la semaine.</p>
            </div>
          ) : (
            <ol className={cn(card, "divide-y divide-slate-100 dark:divide-[var(--border)]")}>
              {timeline.map((b) => {
                const liveCourse = b.kind === "course" && viewingToday && isLive(b.slot);
                const livePause = b.kind === "pause" && viewingToday && b.start <= nowMin && nowMin < b.end;
                return (
                  <li
                    key={b.id}
                    className={cn("flex gap-3 px-3.5 py-3", (liveCourse || livePause) && "bg-emerald-50 dark:bg-emerald-900/20")}
                  >
                    <div className="w-11 shrink-0 pt-0.5 text-right tabular-nums">
                      <p className={cn("text-xs font-bold", liveCourse || livePause ? "text-emerald-800 dark:text-emerald-300" : "text-slate-900 dark:text-slate-100")}>
                        {clock(b.start)}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{clock(b.end)}</p>
                    </div>
                    {b.kind === "course" ? (
                      <CourseCard
                        slot={b.slot}
                        liveNow={liveCourse}
                        next={viewingToday && !liveCourse && nextToday?.id === b.slot.id}
                      />
                    ) : (
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        <Coffee className="h-3.5 w-3.5" aria-hidden />
                        {livePause ? "Pause en cours" : "Pause"}
                        <span className="text-xs tabular-nums">
                          · {clock(b.start)} – {clock(b.end)}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : (
        <>
          <div role="tablist" aria-label="Semaine" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
            {options.map((o) => (
              <button
                key={o.offset}
                type="button"
                role="tab"
                aria-selected={weekOffset === o.offset}
                onClick={() => setWeekOffset(o.offset)}
                className={cn(
                  "flex min-h-12 shrink-0 flex-col items-center justify-center rounded-xl px-3.5 text-xs font-semibold transition-colors",
                  weekOffset === o.offset
                    ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                    : "text-slate-700 dark:text-slate-300",
                )}
              >
                <span className="text-[10px] font-bold">{o.badge}</span>
                <span className="whitespace-nowrap">{o.range}</span>
              </button>
            ))}
          </div>

          <div className={cn(card, "flex items-center gap-3.5 p-4")}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              <CalendarClock className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {selectedOption?.badge ?? "Semaine"}
              </p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{selectedOption?.range}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{weekTotal} cours sur la semaine</p>
            </div>
          </div>

          <div className="space-y-3">
            {days.map((d) => {
              const items = slotsOfDay(d.day);
              const highlight = d.isToday && weekOffset === 0;
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => {
                    setSelectedDay(d.day);
                    if (d.isToday) setWeekOffset(0);
                    setScope("day");
                  }}
                  className={cn(
                    card,
                    "block w-full p-3.5 text-left",
                    highlight ? "border-emerald-600" : d.day === selectedDay && "border-slate-400",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{d.longLabel}</span>
                    {highlight ? (
                      <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white">AUJ.</span>
                    ) : null}
                    <span className="ml-auto text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {items.length === 0 ? "Libre" : `${items.length} cours`}
                    </span>
                  </span>
                  {items.length === 0 ? (
                    <span className="mt-2 block text-xs text-slate-600 dark:text-slate-300">Aucun cours</span>
                  ) : (
                    <span className="mt-2 block divide-y divide-slate-200 overflow-hidden rounded-xl bg-slate-50 dark:divide-[var(--border)] dark:bg-[var(--surface-2)]">
                      {items.map((s) => {
                        const liveNow = highlight && isLive(s);
                        const next = highlight && !liveNow && nextToday?.id === s.id;
                        const sw = subjectSwatch(s.subjectName);
                        return (
                          <span key={s.id} className={cn("flex items-center gap-2.5 px-2.5 py-2", liveNow && "bg-emerald-50 dark:bg-emerald-900/20")}>
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", liveNow ? "bg-emerald-600" : sw.dot)} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {s.subjectName}
                                {liveNow ? <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">En cours</span> : null}
                                {next ? <span className="text-[10px] font-bold uppercase text-brand-800 dark:text-brand-200">Prochain</span> : null}
                              </span>
                              <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
                                {[
                                  `${clock(timeToMinutes(s.start_time))}–${clock(timeToMinutes(s.end_time))}`,
                                  s.teacherName,
                                  formatRoomLabel(s.room),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
