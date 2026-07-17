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
  { day: 1, label: "Lundi", headerClass: "bg-sky-300 text-sky-950" },
  { day: 2, label: "Mardi", headerClass: "bg-emerald-300 text-emerald-950" },
  { day: 3, label: "Mercredi", headerClass: "bg-amber-300 text-amber-950" },
  { day: 4, label: "Jeudi", headerClass: "bg-rose-300 text-rose-950" },
  { day: 5, label: "Vendredi", headerClass: "bg-violet-300 text-violet-950" },
  { day: 6, label: "Samedi", headerClass: "bg-slate-300 text-slate-900" },
] as const;

const DEFAULT_START_MIN = 7 * 60;
const DEFAULT_END_MIN = 17 * 60;
const PX_PER_MIN = 1.35;

const SLOT_COLORS = [
  "border-sky-400 bg-sky-50",
  "border-emerald-400 bg-emerald-50",
  "border-amber-400 bg-amber-50",
  "border-rose-400 bg-rose-50",
  "border-violet-400 bg-violet-50",
  "border-teal-400 bg-teal-50",
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
  className?: string;
};

export function TimetableGrid({
  slots,
  title = "Emploi du temps",
  onRemove,
  className,
}: Props) {
  const hasSaturday = slots.some((s) => s.day_of_week === 6);
  const days = DAY_META.filter((d) => d.day <= 5 || hasSaturday);

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
        "overflow-hidden rounded-2xl border-2 border-slate-800 bg-white shadow-sm",
        className,
      )}
    >
      <div className="border-b-2 border-slate-800 px-4 py-3">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <div
          className="min-w-[640px]"
          style={{
            display: "grid",
            gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="flex items-center justify-center border-b-2 border-r-2 border-slate-800 bg-slate-50 px-1 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-700">
            Heure
          </div>
          {days.map((d) => (
            <div
              key={d.day}
              className={cn(
                "border-b-2 border-r-2 border-slate-800 px-2 py-2 text-center text-sm font-bold last:border-r-0",
                d.headerClass,
              )}
            >
              {d.label}
            </div>
          ))}

          <div
            className="relative border-r-2 border-slate-800 bg-slate-50"
            style={{ height: bodyHeight }}
          >
            {hourMarks.map((m) => (
              <div
                key={m}
                className="absolute right-0 left-0 border-t border-slate-300 first:border-t-0"
                style={{ top: (m - rangeStart) * PX_PER_MIN }}
              >
                <span className="absolute top-0 right-1.5 -translate-y-1/2 text-[11px] font-semibold text-slate-600">
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
                className="relative border-r-2 border-slate-800 last:border-r-0"
                style={{ height: bodyHeight }}
              >
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="pointer-events-none absolute right-0 left-0 border-t border-slate-200 first:border-t-0"
                    style={{ top: (m - rangeStart) * PX_PER_MIN }}
                  />
                ))}

                {daySlots.map((slot) => {
                  const start = timeToMinutes(slot.start_time);
                  const end = timeToMinutes(slot.end_time);
                  const top = Math.max(0, (start - rangeStart) * PX_PER_MIN);
                  const height = Math.max(28, (end - start) * PX_PER_MIN - 2);
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        "absolute right-1 left-1 z-[1] overflow-hidden rounded-md border px-1.5 py-1 shadow-sm",
                        colorForSubject(slot.subjectName),
                      )}
                      style={{ top, height }}
                      title={[
                        slot.subjectName,
                        `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`,
                        slot.teacherName,
                        slot.className,
                        slot.room ? `Salle ${slot.room}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="min-w-0 truncate text-xs font-bold leading-tight text-slate-900">
                          {slot.subjectName}
                        </p>
                        {onRemove ? (
                          <button
                            type="button"
                            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-white/80 hover:text-red-600"
                            aria-label="Supprimer le créneau"
                            onClick={() => onRemove(slot.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <p className="truncate text-[10px] font-medium text-slate-600">
                        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                      </p>
                      {slot.teacherName ? (
                        <p className="truncate text-[10px] text-slate-600">
                          {slot.teacherName}
                        </p>
                      ) : null}
                      {slot.className ? (
                        <p className="truncate text-[10px] text-slate-500">
                          {slot.className}
                        </p>
                      ) : null}
                      {slot.room ? (
                        <p className="truncate text-[10px] text-slate-500">
                          Salle {slot.room}
                        </p>
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
