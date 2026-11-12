import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, Calendar, ChevronRight, Clock, CupSoda, MapPin, SunMedium, User } from "lucide-react";
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

const card = "ios-card";
const INK = "text-[#0f172a] dark:text-slate-100";
const MUTED = "text-[#64748b] dark:text-slate-300";
const GREEN = "#4b8f4a";
const NAVY = "#153064";
const TEAL = "#0f766e";

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

  const seg = (active: boolean) => ({ role: "tab" as const, "aria-selected": active });
  const rgb = (c: readonly [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const Badge = ({ children, color, solid }: { children: string; color: string; solid?: boolean }) => (
    <span
      className="rounded-full px-[7px] py-[3px] text-[11px] font-bold uppercase leading-none"
      style={solid ? { backgroundColor: color, color: "#fff" } : { backgroundColor: `${color}1a`, color }}
    >
      {children}
    </span>
  );

  const CourseCard = ({ slot, liveNow, next }: { slot: TimetableGridSlot; liveNow: boolean; next: boolean }) => {
    const sw = subjectSwatch(slot.subjectName);
    const room = formatRoomLabel(slot.room);
    const changed = changedIds.includes(slot.id);
    return (
      <div className="flex min-w-0 items-stretch gap-[10px]">
        <span className="w-1 shrink-0 rounded-sm" style={{ backgroundColor: liveNow ? GREEN : rgb(sw.border) }} aria-hidden />
        <div className="min-w-0 space-y-[5px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[15px] font-semibold", INK)}>{slot.subjectName}</span>
            {liveNow ? <Badge color={GREEN} solid>En cours</Badge> : next ? <Badge color={NAVY}>Prochain</Badge> : null}
            {changed ? (
              <span className="rounded-full bg-[#ff9500]/[0.14] px-[7px] py-[3px] text-[11px] font-bold uppercase leading-none text-[#ff9500]">
                Modifié
              </span>
            ) : null}
          </div>
          {slot.teacherName || room ? (
            <p className={cn("flex flex-wrap gap-x-2 gap-y-0.5 text-xs", MUTED)}>
              {slot.teacherName ? (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" fill="currentColor" aria-hidden />
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
      </div>
    );
  };

  /** 52 pt circle + caption2 / headline / caption (day and week summary). */
  const Summary = ({
    color,
    icon,
    children,
  }: {
    color: string;
    icon: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div className={cn(card, "flex items-center gap-[14px] p-4")}>
      <span
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
  const cap = cn("text-[11px] font-bold uppercase tracking-[0.5px]", MUTED);
  const head = cn("text-[17px] font-semibold leading-snug", INK);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Affichage" className="ios-seg">
        {(["day", "week"] as const).map((sc) => (
          <button key={sc} type="button" {...seg(scope === sc)} onClick={() => setScope(sc)}>
            {sc === "day" ? "Jour" : "Semaine"}
          </button>
        ))}
      </div>

      {scope === "day" ? (
        <>
          <div className="grid grid-cols-6 gap-1.5 rounded-2xl bg-[#f1f5f9] p-1 dark:bg-[var(--surface-2)]">
            {stripDays.map((d) => {
              const selected = d.day === selectedDay;
              const has = slots.some((sl) => sl.day_of_week === d.day);
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setSelectedDay(d.day)}
                  aria-pressed={selected}
                  aria-label={d.longLabel + (d.isToday ? " (aujourd’hui)" : "")}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] py-2 transition-colors",
                    selected ? "bg-white dark:bg-[var(--surface)]" : "",
                    d.isToday && "border-[1.5px] border-[#4b8f4a] bg-[#4b8f4a]/[0.12]",
                    d.isToday && selected && "bg-white",
                  )}
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: d.isToday ? GREEN : selected ? NAVY : "#64748b" }}
                  >
                    {d.short}
                  </span>
                  <span className={cn("text-[17px] font-bold tabular-nums", selected || d.isToday ? INK : MUTED)}>
                    {d.number}
                  </span>
                  {d.isToday ? (
                    <span className="rounded-full bg-[#4b8f4a] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">AUJ</span>
                  ) : (
                    <span
                      className="my-[3px] h-[5px] w-[5px] rounded-full"
                      style={{ backgroundColor: has ? (selected ? NAVY : TEAL) : "transparent" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          <Summary
            color={live ? GREEN : NAVY}
            icon={live ? <Clock className="h-[22px] w-[22px]" fill="currentColor" stroke="#fff" /> : <Calendar className="h-[22px] w-[22px]" strokeWidth={2.2} />}
          >
            <p className="flex items-center gap-2">
              <span className={cn(cap, "truncate")}>
                {selectedLabel ? `${selectedLabel.longLabel}${selectedLabel.isToday ? " · aujourd’hui" : ""}` : ""}
              </span>
              {viewingToday ? (
                <span className="rounded-full bg-[#153064]/[0.08] px-2 py-[3px] text-[11px] font-bold tabular-nums text-[#153064] dark:text-slate-100">
                  {clock(nowMin)}
                </span>
              ) : null}
            </p>
            {daySlots.length === 0 ? (
              <p className={head}>{viewingToday ? "Aucun cours aujourd’hui" : "Aucun cours"}</p>
            ) : live ? (
              <>
                <p className={cn(head, "truncate")}>En cours · {live.subjectName}</p>
                <p className="text-xs text-[#4b8f4a]">
                  {clock(timeToMinutes(live.start_time))} – {clock(timeToMinutes(live.end_time))}
                </p>
              </>
            ) : upcoming ? (
              <>
                <p className={cn(head, "truncate")}>Prochain · {upcoming.subjectName}</p>
                <p className={cn("text-xs", MUTED)}>À {clock(timeToMinutes(upcoming.start_time))}</p>
              </>
            ) : viewingToday ? (
              <>
                <p className={head}>Journée terminée</p>
                <p className={cn("text-xs", MUTED)}>
                  {daySlots.length} cours · {dayWindow}
                </p>
              </>
            ) : (
              <>
                <p className={head}>{daySlots.length} cours</p>
                <p className={cn("text-xs", MUTED)}>{dayWindow}</p>
              </>
            )}
          </Summary>

          {timeline.length === 0 ? (
            <div className={cn(card, "flex flex-col items-center gap-2 px-4 py-7 text-center")}>
              <SunMedium className="h-[26px] w-[26px] text-[#0f766e]" />
              <p className={head}>Pas de cours ce jour</p>
              <p className={cn("text-xs", MUTED)}>Choisis un autre jour ou regarde la semaine.</p>
            </div>
          ) : (
            <ol className={cn(card, "overflow-hidden")}>
              {timeline.map((b, idx) => {
                const liveCourse = b.kind === "course" && viewingToday && isLive(b.slot);
                const livePause = b.kind === "pause" && viewingToday && b.start <= nowMin && nowMin < b.end;
                return (
                  <li key={b.id} className="relative">
                    {idx > 0 ? <span className="ios-hairline absolute left-[70px] right-0 top-0" /> : null}
                    <div className={cn("flex items-start gap-3 rounded-xl px-[14px] py-3", (liveCourse || livePause) && "bg-[#4b8f4a]/[0.08]")}>
                      <div className="w-11 shrink-0 space-y-0.5 pt-0.5 text-right tabular-nums">
                        <p className={cn("text-xs font-bold", liveCourse || livePause ? "text-[#4b8f4a]" : INK)}>{clock(b.start)}</p>
                        <p className={cn("text-[11px] font-semibold", MUTED)}>{clock(b.end)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        {b.kind === "course" ? (
                          <CourseCard slot={b.slot} liveNow={liveCourse} next={viewingToday && !liveCourse && nextToday?.id === b.slot.id} />
                        ) : (
                          <p className="flex items-center gap-2 rounded-[10px] bg-[#f8fafc] px-2.5 py-1 dark:bg-[var(--surface-2)]">
                            <CupSoda className="h-3 w-3" style={{ color: livePause ? GREEN : "#64748b" }} aria-hidden />
                            <span className="text-[15px] font-semibold" style={{ color: livePause ? GREEN : "#64748b" }}>
                              {livePause ? "Pause en cours" : "Pause"}
                            </span>
                            <span className={cn("text-xs font-semibold tabular-nums", MUTED)}>
                              · {clock(b.start)} – {clock(b.end)}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : (
        <>
          <div role="tablist" aria-label="Semaine" className="flex gap-1.5 overflow-x-auto rounded-2xl bg-[#f1f5f9] p-1 dark:bg-[var(--surface-2)]">
            {options.map((o) => (
              <button
                key={o.offset}
                type="button"
                {...seg(weekOffset === o.offset)}
                onClick={() => setWeekOffset(o.offset)}
                className={cn(
                  "flex min-h-12 shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] px-[14px] py-2.5 transition-colors",
                  weekOffset === o.offset ? "bg-white text-[#153064] dark:bg-[var(--surface)] dark:text-slate-100" : "text-[#64748b] dark:text-slate-300",
                )}
              >
                <span className="text-[11px] font-bold">{o.badge}</span>
                <span className="whitespace-nowrap text-xs font-semibold">{o.range}</span>
              </button>
            ))}
          </div>

          <Summary color={TEAL} icon={<CalendarClock className="h-[22px] w-[22px]" strokeWidth={2.2} />}>
            <p className={cap}>{selectedOption?.badge ?? "Semaine"}</p>
            <p className={head}>{selectedOption?.range}</p>
            <p className={cn("text-xs", MUTED)}>{weekTotal} cours sur la semaine</p>
          </Summary>

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
                  className={cn(card, "block w-full space-y-[10px] border-[1.5px] border-transparent p-[14px] text-left")}
                  style={
                    highlight
                      ? { borderColor: "rgba(75,143,74,0.45)" }
                      : d.day === selectedDay
                        ? { borderColor: "rgba(21,48,100,0.28)" }
                        : undefined
                  }
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("text-[15px] font-bold", INK)}>{d.longLabel}</span>
                    {highlight ? (
                      <span className="rounded-full bg-[#4b8f4a] px-2 py-[3px] text-[11px] font-bold leading-none text-white">AUJ.</span>
                    ) : null}
                    <span className={cn("ml-auto text-xs font-semibold", MUTED)}>{items.length === 0 ? "Libre" : `${items.length} cours`}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-[#64748b]" strokeWidth={2.6} aria-hidden />
                  </span>
                  {items.length === 0 ? (
                    <span className={cn("block text-xs", MUTED)}>Aucun cours</span>
                  ) : (
                    <span className="block divide-y divide-[rgba(60,60,67,0.12)] overflow-hidden rounded-xl bg-[#f8fafc] dark:divide-[var(--border)] dark:bg-[var(--surface-2)]">
                      {items.map((sl) => {
                        const liveNow = highlight && isLive(sl);
                        const next = highlight && !liveNow && nextToday?.id === sl.id;
                        const sw = subjectSwatch(sl.subjectName);
                        return (
                          <span key={sl.id} className={cn("flex items-center gap-[10px] px-2.5 py-2", liveNow && "bg-[#4b8f4a]/[0.08]")}>
                            <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: liveNow ? GREEN : rgb(sw.border) }} aria-hidden />
                            <span className="min-w-0 flex-1 space-y-0.5">
                              <span className={cn("flex items-center gap-1.5 text-[15px] font-semibold", INK)}>
                                {sl.subjectName}
                                {liveNow ? <span className="text-[11px] font-bold uppercase text-[#4b8f4a]">En cours</span> : null}
                                {next ? <span className="text-[11px] font-bold uppercase text-[#153064] dark:text-brand-200">Prochain</span> : null}
                              </span>
                              <span className={cn("block truncate text-xs", MUTED)}>
                                {[
                                  `${clock(timeToMinutes(sl.start_time))}–${clock(timeToMinutes(sl.end_time))}`,
                                  sl.teacherName,
                                  formatRoomLabel(sl.room),
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
