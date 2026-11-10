import { X } from "lucide-react";
import { useMemo } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { timeToMinutes } from "@/lib/timetableConflicts";
import {
  computeScheduleFocus,
  dbDayOfWeek,
} from "@/lib/timetableSchedule";
import { cn } from "@/lib/utils";

export type TimetableGridSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subjectName: string;
  teacherName?: string | null;
  room?: string | null;
  className?: string | null;
};

const DAY_META = [
  {
    day: 1,
    label: "Lundi",
    headerClass:
      "bg-sky-300 text-sky-950 dark:bg-sky-700 dark:text-sky-50",
  },
  {
    day: 2,
    label: "Mardi",
    headerClass:
      "bg-emerald-300 text-emerald-950 dark:bg-emerald-700 dark:text-emerald-50",
  },
  {
    day: 3,
    label: "Mercredi",
    headerClass:
      "bg-amber-300 text-amber-950 dark:bg-amber-600 dark:text-amber-50",
  },
  {
    day: 4,
    label: "Jeudi",
    headerClass:
      "bg-rose-300 text-rose-950 dark:bg-rose-700 dark:text-rose-50",
  },
  {
    day: 5,
    label: "Vendredi",
    headerClass:
      "bg-violet-300 text-violet-950 dark:bg-violet-700 dark:text-violet-50",
  },
  // Many BF schools teach on Saturday — always shown in the grid.
  {
    day: 6,
    label: "Samedi",
    headerClass:
      "bg-teal-300 text-teal-950 dark:bg-teal-700 dark:text-teal-50",
  },
] as const;

const DEFAULT_START_MIN = 7 * 60;
/** Default end when empty — expands automatically if créneaux go later. */
const DEFAULT_END_MIN = 15 * 60;
/** ~81px per hour: readable créneaux without a huge empty grid. */
const PX_PER_MIN = 1.35;

/** Stronger pastels so each matière reads clearly (aligned with PDF export). */
const SLOT_COLORS = [
  "border-sky-500 bg-sky-200 dark:!border-sky-400 dark:!bg-sky-900",
  "border-emerald-500 bg-emerald-200 dark:!border-emerald-400 dark:!bg-emerald-900",
  "border-amber-500 bg-amber-200 dark:!border-amber-400 dark:!bg-amber-900",
  "border-rose-500 bg-rose-200 dark:!border-rose-400 dark:!bg-rose-900",
  "border-violet-500 bg-violet-200 dark:!border-violet-400 dark:!bg-violet-900",
  "border-teal-500 bg-teal-200 dark:!border-teal-400 dark:!bg-teal-900",
  "border-orange-500 bg-orange-200 dark:!border-orange-400 dark:!bg-orange-900",
  "border-purple-500 bg-purple-200 dark:!border-purple-400 dark:!bg-purple-900",
  "border-cyan-500 bg-cyan-200 dark:!border-cyan-400 dark:!bg-cyan-900",
  "border-lime-500 bg-lime-200 dark:!border-lime-400 dark:!bg-lime-900",
  "border-pink-500 bg-pink-200 dark:!border-pink-400 dark:!bg-pink-900",
  "border-yellow-500 bg-yellow-200 dark:!border-yellow-400 dark:!bg-yellow-800",
];

function subjectHash(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 997;
  return h;
}

/** Prefer distinct colors within one grid; same subject keeps the same color. */
function buildSubjectColorMap(subjectNames: string[]): Map<string, string> {
  const unique = [
    ...new Set(subjectNames.map((n) => (n || "Cours").trim() || "Cours")),
  ];
  const used = new Set<number>();
  const map = new Map<string, string>();

  for (const name of unique) {
    let idx = subjectHash(name) % SLOT_COLORS.length;
    if (used.has(idx)) {
      for (let step = 1; step < SLOT_COLORS.length; step++) {
        const next = (idx + step) % SLOT_COLORS.length;
        if (!used.has(next)) {
          idx = next;
          break;
        }
      }
    }
    used.add(idx);
    map.set(name, SLOT_COLORS[idx]);
  }
  return map;
}

const DAY_ACCENTS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-lime-600",
  "bg-pink-500",
  "bg-yellow-500",
];

function buildSubjectAccentMap(subjectNames: string[]): Map<string, string> {
  const unique = [
    ...new Set(subjectNames.map((n) => (n || "Cours").trim() || "Cours")),
  ];
  const used = new Set<number>();
  const map = new Map<string, string>();
  for (const name of unique) {
    let idx = subjectHash(name) % DAY_ACCENTS.length;
    if (used.has(idx)) {
      for (let step = 1; step < DAY_ACCENTS.length; step++) {
        const next = (idx + step) % DAY_ACCENTS.length;
        if (!used.has(next)) {
          idx = next;
          break;
        }
      }
    }
    used.add(idx);
    map.set(name, DAY_ACCENTS[idx]!);
  }
  return map;
}

function formatHourLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Props = {
  slots: TimetableGridSlot[];
  title?: string;
  onRemove?: (id: string) => void;
  onSelect?: (id: string) => void;
  className?: string;
  /** Default true — Lundi→Samedi (many schools teach Saturday). */
  includeSaturday?: boolean;
  /** Slot ids to visually emphasize (e.g. recent additions). */
  highlightIds?: string[];
  /** Highlight this weekday column (1=Mon … 6=Sat). */
  highlightDay?: number | null;
};

export function TimetableGrid({
  slots,
  title = "Emploi du temps",
  onRemove,
  onSelect,
  className,
  includeSaturday = true,
  highlightIds = [],
  highlightDay = null,
}: Props) {
  const days = includeSaturday
    ? DAY_META
    : DAY_META.filter((d) => d.day <= 5);
  const highlight = new Set(highlightIds);
  const subjectColors = useMemo(
    () =>
      buildSubjectColorMap(
        slots.map((s) =>
          [s.className, s.subjectName].filter(Boolean).join(" · ") ||
          s.subjectName,
        ),
      ),
    [slots],
  );

  let rangeStart = DEFAULT_START_MIN;
  let rangeEnd = DEFAULT_END_MIN;
  if (slots.length > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (const s of slots) {
      min = Math.min(min, timeToMinutes(s.start_time));
      max = Math.max(max, timeToMinutes(s.end_time));
    }
    rangeStart = Math.min(DEFAULT_START_MIN, Math.floor(min / 60) * 60);
    rangeEnd = Math.max(DEFAULT_END_MIN, Math.ceil(max / 60) * 60);
  }

  const totalMinutes = Math.max(rangeEnd - rangeStart, 60);
  const bodyHeight = totalMinutes * PX_PER_MIN;
  const hourMarks: number[] = [];
  for (let m = rangeStart; m <= rangeEnd; m += 60) hourMarks.push(m);

  const slotsByDay = new Map<number, TimetableGridSlot[]>();
  for (const day of days) slotsByDay.set(day.day, []);
  for (const s of slots) {
    const list = slotsByDay.get(s.day_of_week);
    if (list) list.push(s);
  }

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-slate-800 bg-white shadow-sm dark:border-slate-600 dark:bg-[var(--surface)]",
        className,
      )}
    >
      <div className="border-b-2 border-slate-800 px-4 py-3 dark:border-slate-600">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <div
          className="min-w-[760px]"
          style={{
            display: "grid",
            gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="flex items-center justify-center border-b-2 border-r-2 border-slate-800 bg-slate-50 px-1 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-700 dark:border-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-200">
            Heure
          </div>
          {days.map((d) => {
            const isToday = highlightDay === d.day;
            return (
              <div
                key={d.day}
                className={cn(
                  "border-b-2 border-r-2 border-slate-800 px-2 py-2 text-center text-sm font-bold last:border-r-0 dark:border-slate-600",
                  d.headerClass,
                  isToday && "ring-2 ring-inset ring-brand-600 dark:ring-brand-300",
                )}
              >
                {d.label}
                {isToday ? (
                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-90">
                    Aujourd’hui
                  </span>
                ) : null}
              </div>
            );
          })}

          <div
            className="relative border-r-2 border-slate-800 bg-slate-50 dark:border-slate-600 dark:bg-[var(--surface-2)]"
            style={{ height: bodyHeight }}
          >
            {hourMarks.map((m) => (
              <div
                key={m}
                className="absolute right-0 left-0 border-t border-slate-300 first:border-t-0 dark:border-slate-600"
                style={{ top: (m - rangeStart) * PX_PER_MIN }}
              >
                <span className="absolute top-0 right-1.5 -translate-y-1/2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {formatHourLabel(m)}
                </span>
              </div>
            ))}
          </div>

          {days.map((d) => {
            const daySlots = slotsByDay.get(d.day) ?? [];
            const isToday = highlightDay === d.day;
            return (
              <div
                key={d.day}
                className={cn(
                  "relative overflow-visible border-r-2 border-slate-800 last:border-r-0 dark:border-slate-600 dark:bg-[var(--bg)]",
                  isToday && "bg-brand-50/40 dark:bg-brand-950/20",
                )}
                style={{ height: bodyHeight }}
              >
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="pointer-events-none absolute right-0 left-0 border-t border-slate-200 first:border-t-0 dark:border-slate-700"
                    style={{ top: (m - rangeStart) * PX_PER_MIN }}
                  />
                ))}

                {daySlots.map((slot) => {
                  const start = timeToMinutes(slot.start_time);
                  const end = timeToMinutes(slot.end_time);
                  const durationMin = Math.max(end - start, 1);
                  const top = Math.max(0, (start - rangeStart) * PX_PER_MIN);
                  const naturalH = durationMin * PX_PER_MIN - 2;
                  const height = Math.max(24, naturalH);
                  const timeLabel = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`;
                  // xs: one line · sm: title+time · md+: + teacher/room
                  const density =
                    height < 34 ? "xs" : height < 50 ? "sm" : height < 70 ? "md" : "lg";
                  const tip = [
                    onSelect ? "Cliquer pour modifier" : null,
                    slot.subjectName,
                    timeLabel,
                    slot.teacherName,
                    slot.className,
                    slot.room ? `Salle ${slot.room}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const subjectKey =
                    [slot.className, slot.subjectName]
                      .filter(Boolean)
                      .join(" · ") ||
                    (slot.subjectName || "Cours").trim() ||
                    "Cours";
                  const slotColor =
                    subjectColors.get(subjectKey) ?? SLOT_COLORS[0];
                  const klass = slot.className?.trim() || null;
                  const subject = slot.subjectName?.trim() || "Cours";

                  return (
                    <div
                      key={slot.id}
                      data-edt-slot
                      role={onSelect ? "button" : undefined}
                      tabIndex={onSelect ? 0 : undefined}
                      onClick={
                        onSelect
                          ? () => {
                              onSelect(slot.id);
                            }
                          : undefined
                      }
                      onKeyDown={
                        onSelect
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelect(slot.id);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "group/slot absolute right-1 left-1 z-[1] overflow-hidden rounded-md border-2 shadow-sm",
                        density === "xs" ? "px-1 py-0.5" : "px-1.5 py-1",
                        slotColor,
                        onSelect &&
                          "cursor-pointer transition hover:z-20 hover:brightness-95 dark:hover:brightness-110",
                        // Expand short cards on hover so all infos become readable
                        density !== "lg" &&
                          "hover:min-h-[4.25rem] hover:overflow-visible hover:shadow-md",
                        highlight.has(slot.id) &&
                          "ring-2 ring-brand-500 ring-offset-1 ring-offset-transparent animate-pulse dark:ring-brand-300",
                      )}
                      style={{ top, height }}
                      title={tip}
                    >
                      {density === "xs" ? (
                        <div className="flex h-full items-center gap-1">
                          <p className="edt-slot-title min-w-0 flex-1 text-[10px] font-bold leading-tight text-slate-900">
                            {klass ?? subject}
                            <span className="edt-slot-body font-medium text-slate-700">
                              {" "}
                              · {timeLabel}
                            </span>
                          </p>
                          {onRemove ? (
                            <button
                              type="button"
                              className="edt-slot-muted shrink-0 rounded p-0.5 text-slate-500 hover:bg-black/10 hover:text-red-600 dark:hover:bg-white/15 dark:hover:text-red-300"
                              aria-label="Supprimer le créneau"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemove(slot.id);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              {klass ? (
                                <>
                                  <p className="edt-slot-title text-xs font-bold leading-tight text-slate-900">
                                    {klass}
                                  </p>
                                  <p className="edt-slot-body text-[11px] font-semibold leading-snug text-slate-800">
                                    {subject}
                                  </p>
                                </>
                              ) : (
                                <p className="edt-slot-title text-xs font-bold leading-snug text-slate-900">
                                  {subject}
                                </p>
                              )}
                            </div>
                            {onRemove ? (
                              <button
                                type="button"
                                className="edt-slot-muted shrink-0 rounded p-0.5 text-slate-500 hover:bg-black/10 hover:text-red-600 dark:hover:bg-white/15 dark:hover:text-red-300"
                                aria-label="Supprimer le créneau"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemove(slot.id);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <p className="edt-slot-body text-[10px] font-medium leading-tight text-slate-700">
                            {timeLabel}
                          </p>
                          {density !== "sm" && slot.teacherName ? (
                            <p className="edt-slot-body text-[10px] leading-tight text-slate-600">
                              {slot.teacherName}
                            </p>
                          ) : null}
                          {density === "lg" && slot.room ? (
                            <p className="edt-slot-muted text-[10px] leading-tight text-slate-500">
                              Salle {slot.room}
                            </p>
                          ) : null}
                          {/* Extra details revealed when a compact card expands on hover */}
                          {density === "sm" ? (
                            <div className="mt-0.5 hidden group-hover/slot:block">
                              {slot.teacherName ? (
                                <p className="edt-slot-body text-[10px] text-slate-600">
                                  {slot.teacherName}
                                </p>
                              ) : null}
                              {slot.room ? (
                                <p className="edt-slot-muted text-[10px] text-slate-500">
                                  Salle {slot.room}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {density === "md" && slot.room ? (
                            <p className="edt-slot-muted hidden text-[10px] text-slate-500 group-hover/slot:block">
                              Salle {slot.room}
                            </p>
                          ) : null}
                        </>
                      )}
                      {density === "xs" ? (
                        <div className="mt-1 hidden rounded-md border border-slate-200/80 bg-inherit p-1 shadow-sm group-hover/slot:block dark:border-slate-600">
                          {klass ? (
                            <p className="edt-slot-body text-[10px] text-slate-700">
                              {subject}
                            </p>
                          ) : null}
                          {slot.teacherName ? (
                            <p className="edt-slot-body text-[10px] text-slate-600">
                              {slot.teacherName}
                            </p>
                          ) : null}
                          {slot.room ? (
                            <p className="edt-slot-muted text-[10px] text-slate-500">
                              Salle {slot.room}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type DayViewProps = {
  slots: TimetableGridSlot[];
  highlightIds?: string[];
  /** 1 = Monday … 6 = Saturday. */
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onShowWeek?: () => void;
};

function hm(value: string) {
  return value.slice(0, 5);
}

function relativePhrase(minutes: number, current: boolean): string {
  if (current) {
    if (minutes <= 1) return "finit bientôt";
    return `encore ${minutes} min`;
  }
  if (minutes <= 0) return "maintenant";
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `dans ${hours} h` : `dans ${hours} h ${String(rest).padStart(2, "0")}`;
}

/** Phone day list: one weekday, next class on top, pauses called out in text. */
export function TimetableDayView({
  slots,
  highlightIds = [],
  selectedDay,
  onSelectDay,
  onShowWeek,
}: DayViewProps) {
  const now = new Date();
  const today = dbDayOfWeek(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const highlight = new Set(highlightIds);
  const focus = computeScheduleFocus(slots, now);
  const accents = useMemo(
    () => buildSubjectAccentMap(slots.map((s) => s.subjectName)),
    [slots],
  );

  const days = [1, 2, 3, 4, 5, 6].map((day) => {
    const date = addDays(monday, day - 1);
    const raw = format(date, "EEE", { locale: fr }).replace(".", "");
    return {
      day,
      num: format(date, "d"),
      short: raw.charAt(0).toLocaleUpperCase("fr") + raw.slice(1, 3),
      full: format(date, "EEEE d MMMM", { locale: fr }),
    };
  });

  const selectedDate = addDays(monday, selectedDay - 1);
  const selectedIsPast =
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime() <
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const daySlots = slots
    .filter((s) => s.day_of_week === selectedDay)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  const entries: (
    | { kind: "slot"; slot: TimetableGridSlot }
    | { kind: "pause"; from: string; to: string }
  )[] = [];
  for (let i = 0; i < daySlots.length; i++) {
    const slot = daySlots[i]!;
    const prev = daySlots[i - 1];
    if (prev) {
      const gap = timeToMinutes(slot.start_time) - timeToMinutes(prev.end_time);
      if (gap >= 20) {
        entries.push({ kind: "pause", from: hm(prev.end_time), to: hm(slot.start_time) });
      }
    }
    entries.push({ kind: "slot", slot });
  }

  let focusKicker: string | null = null;
  if (focus && selectedDay === today) {
    if (focus.isLaterDay) {
      focusKicker = `Prochain cours · ${focus.dayLabel}`;
    } else if (focus.kind === "current") {
      const left = timeToMinutes(focus.slot.end_time) - nowMinutes;
      focusKicker = `Cours en cours · ${relativePhrase(left, true)}`;
    } else {
      const until = timeToMinutes(focus.slot.start_time) - nowMinutes;
      focusKicker = `Prochain cours · ${relativePhrase(until, false)}`;
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-[var(--surface)]">
      <div className="mb-3 flex justify-end">
        {onShowWeek ? (
          <button
            type="button"
            onClick={onShowWeek}
            className="rounded-full border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-200 dark:hover:bg-brand-900/30"
          >
            Semaine
          </button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Jour de la semaine" className="grid grid-cols-6 gap-1.5">
        {days.map((day) => {
          const selected = day.day === selectedDay;
          return (
            <button
              key={day.day}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-current={day.day === today ? "date" : undefined}
              onClick={() => onSelectDay(day.day)}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                selected
                  ? "bg-brand-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-100",
              )}
            >
              <span className="sr-only">{day.full}</span>
              <span aria-hidden className="text-xs font-medium">
                {day.short}
              </span>
              <span aria-hidden className="text-base leading-tight">
                {day.num}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-4 space-y-3">
        {focus && focusKicker ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-700 dark:bg-emerald-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
              {focusKicker}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
              {focus.slot.subjectName}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {hm(focus.slot.start_time)} – {hm(focus.slot.end_time)}
              {focus.slot.room ? ` · Salle ${focus.slot.room}` : ""}
              {focus.slot.teacherName ? ` · ${focus.slot.teacherName}` : ""}
            </p>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-300">
            Aucun cours ce jour-là.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, index) => {
              if (entry.kind === "pause") {
                return (
                  <li
                    key={`pause-${entry.from}-${index}`}
                    className="py-1 text-center text-sm text-slate-600 dark:text-slate-300"
                  >
                    Pause · {entry.from} – {entry.to}
                  </li>
                );
              }
              const slot = entry.slot;
              const past =
                selectedIsPast ||
                (selectedDay === today && timeToMinutes(slot.end_time) <= nowMinutes);
              const changed = highlight.has(slot.id);
              const subjectKey = (slot.subjectName || "Cours").trim() || "Cours";
              const roomLine = [
                slot.room ? `Salle ${slot.room}` : null,
                slot.teacherName,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={slot.id}>
                  <article
                    className={cn(
                      "flex gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-600 dark:bg-[var(--surface)]",
                      past && "opacity-60",
                      focus?.slot.id === slot.id &&
                        selectedDay === focus.slot.day_of_week &&
                        "border-brand-600",
                    )}
                  >
                    <div className="w-14 shrink-0 text-sm font-semibold tabular-nums leading-tight text-slate-700 dark:text-slate-200">
                      <p>{hm(slot.start_time)}</p>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {hm(slot.end_time)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "w-1 shrink-0 self-stretch rounded-full",
                        accents.get(subjectKey) ?? "bg-slate-400",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {slot.subjectName}
                        </p>
                        {changed ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:bg-amber-600 dark:text-amber-50">
                            Modifié
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                        {roomLine || "Salle et enseignant non précisés"}
                      </p>
                      {past ? <span className="sr-only">Cours passé</span> : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
