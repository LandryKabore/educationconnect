import { useMemo } from "react";
import type { SlotConflictBadge } from "@/lib/timetableConflicts";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { formatClock, formatPauseLabel, formatRoomLabel } from "@/lib/timetableLayout";
import { subjectSwatch } from "@/lib/subjectColors";
import { cn } from "@/lib/utils";

export type DayAgendaSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subjectName: string;
  teacherName?: string | null;
  className?: string | null;
  room?: string | null;
};

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

const BADGE_LABEL: Record<SlotConflictBadge, string> = {
  prof: "Prof",
  salle: "Salle",
  classe: "Classe",
};

function schoolWeek(today: Date) {
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  const js = monday.getDay();
  monday.setDate(monday.getDate() + (js === 0 ? -6 : 1 - js));
  return DAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    return { day: index + 1, label, date: date.getDate(), isToday };
  });
}

type Props = {
  slots: DayAgendaSlot[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
  conflictBadges?: Record<string, SlotConflictBadge[]>;
  conflictDays?: number[];
  onSelectSlot?: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
};

export function TimetableDayAgenda({
  slots,
  selectedDay,
  onSelectDay,
  conflictBadges = {},
  conflictDays = [],
  onSelectSlot,
  onAdd,
  addLabel = "Ajouter un cours ce jour",
}: Props) {
  const today = useMemo(() => new Date(), []);
  const week = useMemo(() => schoolWeek(today), [today]);
  const conflictDaySet = new Set(conflictDays);
  const dayLabel =
    DAY_LABELS[selectedDay - 1] ?? "Jour";

  const items = useMemo(() => {
    const daySlots = slots
      .filter((slot) => slot.day_of_week === selectedDay)
      .sort(
        (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
      );
    const rows: (
      | { kind: "slot"; slot: DayAgendaSlot }
      | { kind: "pause"; startMin: number; endMin: number }
    )[] = [];
    for (let i = 0; i < daySlots.length; i++) {
      const slot = daySlots[i];
      rows.push({ kind: "slot", slot });
      const next = daySlots[i + 1];
      if (!next) continue;
      const gapStart = timeToMinutes(slot.end_time);
      const gapEnd = timeToMinutes(next.start_time);
      if (gapEnd - gapStart >= 120) {
        rows.push({ kind: "pause", startMin: gapStart, endMin: gapEnd });
      }
    }
    return rows;
  }, [slots, selectedDay]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-1">
        {week.map((day) => {
          const selected = day.day === selectedDay;
          const hasConflict = conflictDaySet.has(day.day);
          return (
            <button
              key={day.day}
              type="button"
              onClick={() => onSelectDay(day.day)}
              aria-pressed={selected}
              className={cn(
                "relative flex flex-col items-center rounded-xl px-1 py-2 text-xs",
                selected
                  ? "bg-brand-700 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:text-slate-300 dark:ring-[var(--border)]",
                !selected && day.isToday && "ring-brand-400",
              )}
            >
              <span className="font-medium">{day.label}</span>
              <span className="text-sm font-semibold tabular-nums">{day.date}</span>
              {hasConflict ? (
                <span
                  className={cn(
                    "absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500",
                    selected && "ring-2 ring-brand-700",
                  )}
                  aria-label="Conflit"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          Aucun cours {dayLabel.toLowerCase()}.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            if (item.kind === "pause") {
              return (
                <li
                  key={`pause-${item.startMin}`}
                  className="flex items-center gap-3 py-1 text-xs font-medium text-slate-500"
                >
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                  <span>— {formatPauseLabel(item.startMin, item.endMin)} —</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                </li>
              );
            }

            const slot = item.slot;
            const swatch = subjectSwatch(slot.subjectName);
            const badges = conflictBadges[slot.id] ?? [];
            const room = formatRoomLabel(slot.room);
            const meta = [slot.className, slot.teacherName, room]
              .map((value) => value?.trim())
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={slot.id}>
                <button
                  type="button"
                  onClick={onSelectSlot ? () => onSelectSlot(slot.id) : undefined}
                  className={cn(
                    "flex w-full items-stretch gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:ring-[var(--border)]",
                    badges.length > 0 && "ring-red-400",
                    onSelectSlot && "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "w-1 shrink-0 rounded-full",
                      badges.length > 0 ? "bg-red-600" : swatch.edge,
                    )}
                    aria-hidden
                  />
                  <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                    {formatClock(timeToMinutes(slot.start_time))}
                    <span className="mt-0.5 block font-medium text-slate-400">
                      {slot.end_time.slice(0, 5)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-slate-900">
                      {slot.subjectName}
                    </span>
                    {meta ? (
                      <span className="mt-0.5 block truncate text-[13px] text-slate-600">
                        {meta}
                      </span>
                    ) : null}
                    {badges.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded bg-red-600 px-1.5 py-px text-[10px] font-bold text-white"
                          >
                            ⚠ {BADGE_LABEL[badge]}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {onSelectSlot && badges.length > 0 ? (
                    <span className="self-center text-xs font-semibold text-red-600">
                      Régler
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-2xl border border-dashed border-brand-300 bg-brand-50/40 px-4 py-3 text-sm font-medium text-brand-800"
        >
          + {addLabel}
        </button>
      ) : null}

      {onSelectSlot ? (
        <p className="text-center text-xs text-slate-400">
          Toucher un cours ouvre le panneau en bas de l’écran.
        </p>
      ) : null}
    </div>
  );
}
