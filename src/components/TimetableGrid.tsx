import { X } from "lucide-react";
import { timeToMinutes } from "@/lib/timetableConflicts";
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
const DEFAULT_END_MIN = 17 * 60;
/** Pixels per minute — keeps short créneaux (15–30 min) readable. */
const PX_PER_MIN = 1.7;

/** Light pastels in light mode; solid dark fills in dark mode (readable text). */
const SLOT_COLORS = [
  "border-sky-400 bg-sky-50 dark:!border-sky-400 dark:!bg-sky-900",
  "border-emerald-400 bg-emerald-50 dark:!border-emerald-400 dark:!bg-emerald-900",
  "border-amber-400 bg-amber-50 dark:!border-amber-400 dark:!bg-amber-900",
  "border-rose-400 bg-rose-50 dark:!border-rose-400 dark:!bg-rose-900",
  "border-violet-400 bg-violet-50 dark:!border-violet-400 dark:!bg-violet-900",
  "border-teal-400 bg-teal-50 dark:!border-teal-400 dark:!bg-teal-900",
];

function colorForSubject(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 997;
  return SLOT_COLORS[h % SLOT_COLORS.length];
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
};

export function TimetableGrid({
  slots,
  title = "Emploi du temps",
  onRemove,
  onSelect,
  className,
  includeSaturday = true,
  highlightIds = [],
}: Props) {
  const days = includeSaturday
    ? DAY_META
    : DAY_META.filter((d) => d.day <= 5);
  const highlight = new Set(highlightIds);

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
          {days.map((d) => (
            <div
              key={d.day}
              className={cn(
                "border-b-2 border-r-2 border-slate-800 px-2 py-2 text-center text-sm font-bold last:border-r-0 dark:border-slate-600",
                d.headerClass,
              )}
            >
              {d.label}
            </div>
          ))}

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
            return (
              <div
                key={d.day}
                className="relative overflow-visible border-r-2 border-slate-800 last:border-r-0 dark:border-slate-600 dark:bg-[var(--bg)]"
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
                        "group/slot absolute right-1 left-1 z-[1] overflow-hidden rounded-md border shadow-sm",
                        density === "xs" ? "px-1 py-0.5" : "px-1.5 py-1",
                        colorForSubject(slot.subjectName),
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
                          <p className="edt-slot-title min-w-0 flex-1 truncate text-[10px] font-bold leading-none text-slate-900">
                            {slot.subjectName}
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
                            <p className="edt-slot-title min-w-0 truncate text-xs font-bold leading-tight text-slate-900">
                              {slot.subjectName}
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
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <p className="edt-slot-body truncate text-[10px] font-medium leading-tight text-slate-700">
                            {timeLabel}
                          </p>
                          {density !== "sm" && slot.teacherName ? (
                            <p className="edt-slot-body truncate text-[10px] leading-tight text-slate-600">
                              {slot.teacherName}
                            </p>
                          ) : null}
                          {density === "lg" && slot.className ? (
                            <p className="edt-slot-muted truncate text-[10px] leading-tight text-slate-500">
                              {slot.className}
                            </p>
                          ) : null}
                          {density === "lg" && slot.room ? (
                            <p className="edt-slot-muted truncate text-[10px] leading-tight text-slate-500">
                              Salle {slot.room}
                            </p>
                          ) : null}
                          {/* Extra details revealed when a compact card expands on hover */}
                          {density === "sm" ? (
                            <div className="mt-0.5 hidden group-hover/slot:block">
                              {slot.teacherName ? (
                                <p className="edt-slot-body truncate text-[10px] text-slate-600">
                                  {slot.teacherName}
                                </p>
                              ) : null}
                              {slot.room ? (
                                <p className="edt-slot-muted truncate text-[10px] text-slate-500">
                                  Salle {slot.room}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {density === "md" && slot.room ? (
                            <p className="edt-slot-muted hidden truncate text-[10px] text-slate-500 group-hover/slot:block">
                              Salle {slot.room}
                            </p>
                          ) : null}
                        </>
                      )}
                      {density === "xs" ? (
                        <div className="mt-1 hidden rounded-md border border-slate-200/80 bg-inherit p-1 shadow-sm group-hover/slot:block dark:border-slate-600">
                          {slot.teacherName ? (
                            <p className="edt-slot-body truncate text-[10px] text-slate-600">
                              {slot.teacherName}
                            </p>
                          ) : null}
                          {slot.room ? (
                            <p className="edt-slot-muted truncate text-[10px] text-slate-500">
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
