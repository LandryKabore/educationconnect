import { useMemo, useState } from "react";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import {
  WEEKDAY_LABELS,
  dbDayOfWeek,
  defaultVisibleDay,
  schoolWeekDays,
} from "@/lib/timetableSchedule";
import { cn } from "@/lib/utils";

type PhoneLayout = "jour" | "semaine";

type Props = {
  slots: TimetableGridSlot[];
  title?: string;
  highlightIds?: string[];
  className?: string;
};

export function ReadOnlyTimetable({
  slots,
  title,
  highlightIds,
  className,
}: Props) {
  const highlightDay = dbDayOfWeek();
  const week = useMemo(() => schoolWeekDays(), []);
  const [phoneLayout, setPhoneLayout] = useState<PhoneLayout>("jour");
  const [selectedDay, setSelectedDay] = useState(defaultVisibleDay);
  const showWeekOnPhone = phoneLayout === "semaine";
  const selected = week.find((day) => day.day === selectedDay);
  const selectedLabel = selected
    ? `${WEEKDAY_LABELS[selected.day]} ${selected.dateObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
    : WEEKDAY_LABELS[selectedDay];

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-end md:hidden">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-[var(--surface-2)]">
          {(
            [
              ["jour", "Jour"],
              ["semaine", "Semaine"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={phoneLayout === id}
              onClick={() => setPhoneLayout(id)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium",
                phoneLayout === id
                  ? "bg-brand-700 text-white"
                  : "text-slate-600 dark:text-slate-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={showWeekOnPhone ? "block" : "hidden md:block"}>
        <TimetableGrid
          slots={slots}
          title={title}
          highlightIds={highlightIds}
          highlightDay={highlightDay}
        />
      </div>

      <div className={showWeekOnPhone ? "hidden" : "md:hidden"}>
        {selectedLabel ? (
          <p className="mb-2 text-sm text-slate-500">
            {selectedLabel}
            {selected?.isToday ? " · aujourd’hui" : ""}
          </p>
        ) : null}
        <div className="mb-3 grid grid-cols-6 gap-1">
          {week.map((day) => {
            const isSelected = day.day === selectedDay;
            return (
              <button
                key={day.day}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedDay(day.day)}
                className={cn(
                  "flex flex-col items-center rounded-xl px-1 py-2 text-xs",
                  isSelected
                    ? "bg-brand-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:text-slate-300 dark:ring-[var(--border)]",
                  !isSelected && day.isToday && "ring-brand-400",
                )}
              >
                <span className="font-medium">{day.label}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {day.date}
                </span>
              </button>
            );
          })}
        </div>
        <TimetableGrid
          slots={slots}
          title={title}
          highlightIds={highlightIds}
          highlightDay={highlightDay}
          visibleDays={[selectedDay]}
        />
      </div>
    </div>
  );
}
