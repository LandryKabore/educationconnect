import { AlertTriangle, X } from "lucide-react";
import { useMemo } from "react";
import type { SlotConflictBadge } from "@/lib/timetableConflicts";
import { timeToMinutes } from "@/lib/timetableConflicts";
import {
  clickableHours,
  formatClock,
  formatPauseLabel,
  formatRoomLabel,
  layoutTimetable,
} from "@/lib/timetableLayout";
import { subjectSwatch } from "@/lib/subjectColors";
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
  { day: 1, label: "Lundi" },
  { day: 2, label: "Mardi" },
  { day: 3, label: "Mercredi" },
  { day: 4, label: "Jeudi" },
  { day: 5, label: "Vendredi" },
  // Many BF schools teach on Saturday — always shown in the grid.
  { day: 6, label: "Samedi" },
] as const;

const BADGE_LABEL: Record<SlotConflictBadge, string> = {
  prof: "Prof",
  salle: "Salle",
  classe: "Classe",
};

export function SubjectLegend({
  names,
  className,
}: {
  names: string[];
  className?: string;
}) {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const name of names) {
      const label = name.trim() || "Cours";
      if (seen.has(label)) continue;
      seen.add(label);
      list.push(label);
    }
    return list.sort((a, b) => a.localeCompare(b, "fr"));
  }, [names]);

  if (unique.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600",
        className,
      )}
    >
      {unique.map((name) => {
        const swatch = subjectSwatch(name);
        return (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-sm", swatch.dot)} />
            {name}
          </span>
        );
      })}
      <span className="text-slate-400">
        Même couleur pour une matière dans toutes les classes.
      </span>
    </div>
  );
}

type Props = {
  slots: TimetableGridSlot[];
  title?: string;
  onSelect?: (id: string) => void;
  /** Top-right × on each card. Omitted on read-only timetables. */
  onRemove?: (id: string) => void;
  /** Click an empty hour to add a créneau. Omitted on read-only timetables. */
  onEmptyClick?: (day: number, startMin: number) => void;
  className?: string;
  /** Default true — Lundi→Samedi (many schools teach Saturday). */
  includeSaturday?: boolean;
  /** Slot ids to visually emphasize (e.g. recent additions). */
  highlightIds?: string[];
  /** Highlight this weekday column (1=Mon … 6=Sat). */
  highlightDay?: number | null;
  /** Saved clashes to outline. Read-only views omit this. */
  conflictBadges?: Record<string, SlotConflictBadge[]>;
  /** Weekdays that contain at least one clash (header marker). */
  conflictDays?: number[];
  /** Créneau currently open in the editor. */
  activeId?: string | null;
};

export function TimetableGrid({
  slots,
  title = "Emploi du temps",
  onSelect,
  onRemove,
  onEmptyClick,
  className,
  includeSaturday = true,
  highlightIds = [],
  highlightDay = null,
  conflictBadges = {},
  conflictDays = [],
  activeId = null,
}: Props) {
  const days = includeSaturday ? DAY_META : DAY_META.filter((d) => d.day <= 5);
  const highlight = new Set(highlightIds);
  const conflictDaySet = new Set(conflictDays);

  const scale = useMemo(() => layoutTimetable(slots), [slots]);
  const hourButtons = useMemo(() => clickableHours(scale), [scale]);

  const slotsByDay = new Map<number, TimetableGridSlot[]>();
  for (const day of days) slotsByDay.set(day.day, []);
  for (const slot of slots) {
    const list = slotsByDay.get(slot.day_of_week);
    if (list) list.push(slot);
  }

  const legendNames = slots.map((slot) => slot.subjectName);

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]",
        className,
      )}
    >
      {title ? (
        <div className="border-b border-slate-200 px-4 py-3 dark:border-[var(--border)]">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[40rem]">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:text-slate-300">
              Heure
            </div>
            {days.map((day) => {
              const isToday = highlightDay === day.day;
              const hasConflict = conflictDaySet.has(day.day);
              return (
                <div
                  key={day.day}
                  className={cn(
                    "flex items-center justify-center gap-1 border-b border-r border-slate-200 px-2 py-2 text-center text-sm font-semibold last:border-r-0 dark:border-[var(--border)]",
                    isToday
                      ? "bg-brand-100 text-brand-900"
                      : "bg-slate-50 text-slate-700 dark:bg-[var(--surface-2)]",
                  )}
                >
                  <span>{day.label}</span>
                  {isToday ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-brand-700">
                      auj.
                    </span>
                  ) : null}
                  {hasConflict ? (
                    <AlertTriangle
                      className="h-3.5 w-3.5 text-red-600"
                      aria-label="Conflit ce jour"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div
            className="relative"
            style={{
              display: "grid",
              gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))`,
              height: scale.height,
            }}
          >
            <div className="relative border-r border-slate-200 bg-slate-50 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
              {scale.hourMarks.map((mark) => (
                <div
                  key={mark}
                  className="absolute right-0 left-0 border-t border-slate-200 first:border-t-0 dark:border-[var(--border)]"
                  style={{ top: scale.minuteToY(mark) }}
                >
                  <span className="absolute top-0 right-1.5 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-300">
                    {formatClock(mark)}
                  </span>
                </div>
              ))}
            </div>

            {days.map((day) => {
              const daySlots = slotsByDay.get(day.day) ?? [];
              const isToday = highlightDay === day.day;
              return (
                <div
                  key={day.day}
                  className={cn(
                    "relative border-r border-slate-200 last:border-r-0 dark:border-[var(--border)]",
                    isToday && "bg-brand-50/40",
                  )}
                >
                  {scale.hourMarks.map((mark) => (
                    <div
                      key={mark}
                      className="pointer-events-none absolute right-0 left-0 border-t border-slate-200 first:border-t-0 dark:border-slate-700"
                      style={{ top: scale.minuteToY(mark) }}
                    />
                  ))}

                  {onEmptyClick
                    ? hourButtons.map((block) => (
                        <button
                          key={block.startMin}
                          type="button"
                          className="group/hour absolute right-0 left-0 z-[1] hover:bg-brand-50/80 dark:hover:bg-brand-950/30"
                          style={{ top: block.top, height: block.height }}
                          aria-label={`Ajouter un cours le ${day.label} à ${formatClock(block.startMin)}`}
                          onClick={() => onEmptyClick(day.day, block.startMin)}
                        >
                          {block.height >= 36 ? (
                            <span className="pointer-events-none text-[11px] font-medium text-brand-700 opacity-0 group-hover/hour:opacity-100">
                              + Ajouter ici
                            </span>
                          ) : null}
                        </button>
                      ))
                    : null}

                  {daySlots.map((slot) => {
                    const start = timeToMinutes(slot.start_time);
                    const end = timeToMinutes(slot.end_time);
                    const top = scale.minuteToY(start);
                    const height = Math.max(52, scale.minuteToY(end) - top - 3);
                    const swatch = subjectSwatch(slot.subjectName);
                    const subject = slot.subjectName?.trim() || "Cours";
                    const teacher = slot.teacherName?.trim() || null;
                    const klass = slot.className?.trim() || null;
                    const room = formatRoomLabel(slot.room);
                    const timeLabel = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`;
                    const badges = conflictBadges[slot.id] ?? [];
                    const clashing = badges.length > 0;
                    const tip = [
                      onSelect ? "Cliquer pour modifier" : null,
                      subject,
                      timeLabel,
                      klass,
                      teacher,
                      room,
                      clashing
                        ? `Conflit ${badges.map((badge) => BADGE_LABEL[badge]).join(", ")}`
                        : null,
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
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelect(slot.id);
                                }
                              }
                            : undefined
                        }
                        className={cn(
                          "absolute right-1 left-1 z-[3] overflow-hidden rounded-md border-2 px-1.5 py-1 shadow-sm",
                          swatch.card,
                          onSelect &&
                            "cursor-pointer transition hover:z-20 hover:brightness-95 dark:hover:brightness-110",
                          clashing && "ring-2 ring-red-500",
                          !clashing &&
                            activeId === slot.id &&
                            "ring-2 ring-brand-600",
                          !clashing &&
                            highlight.has(slot.id) &&
                            activeId !== slot.id &&
                            "ring-2 ring-brand-500 ring-offset-1 animate-pulse",
                        )}
                        style={{ top, height }}
                        title={tip}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="edt-slot-title min-w-0 flex-1 truncate text-xs font-bold leading-snug text-slate-900">
                            {subject}
                          </p>
                          {onRemove ? (
                            <button
                              type="button"
                              className="edt-slot-muted -mr-0.5 -mt-0.5 shrink-0 rounded p-0.5 text-slate-600 hover:bg-black/10 hover:text-red-700 dark:hover:bg-white/15 dark:hover:text-red-300"
                              aria-label="Supprimer le créneau"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemove(slot.id);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <p className="edt-slot-body truncate text-[10px] font-medium leading-tight text-slate-700 tabular-nums">
                          {timeLabel}
                        </p>
                        {klass ? (
                          <p className="edt-slot-body truncate text-[10px] leading-tight text-slate-700">
                            {klass}
                          </p>
                        ) : null}
                        {teacher ? (
                          <p className="edt-slot-body truncate text-[10px] leading-tight text-slate-700">
                            {teacher}
                          </p>
                        ) : null}
                        {room ? (
                          <p className="edt-slot-muted truncate text-[10px] leading-tight text-slate-600">
                            {room}
                          </p>
                        ) : null}
                        {badges.length > 0 ? (
                          <div className="mt-0.5 flex flex-wrap gap-0.5">
                            {badges.map((badge) => (
                              <span
                                key={badge}
                                className="rounded bg-red-600 px-1 py-px text-[10px] font-bold leading-tight text-white"
                              >
                                ⚠ {BADGE_LABEL[badge]}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {scale.regions
              .filter((region) => region.kind === "pause")
              .map((region) => (
                <div
                  key={`${region.startMin}-${region.endMin}`}
                  className="absolute right-0 left-0 z-[2]"
                  style={{ top: region.y, height: region.height }}
                >
                  <PauseBand
                    label={formatPauseLabel(region.startMin, region.endMin)}
                    height={region.height}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      {legendNames.length > 0 ? (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-[var(--border)]">
          <SubjectLegend names={legendNames} />
        </div>
      ) : null}
    </div>
  );
}

function PauseBand({ label, height }: { label: string; height: number }) {
  return (
    <div className="flex w-full" style={{ height }}>
      <div className="w-[4.5rem] shrink-0 border-y border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-[var(--surface-2)]" />
      <div
        className="flex flex-1 items-center justify-center border-y border-dashed border-slate-300 bg-slate-50 text-[12px] font-medium text-slate-500 dark:border-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(148,163,184,0.28) 5px, rgba(148,163,184,0.28) 6px)",
        }}
      >
        — {label} —
      </div>
    </div>
  );
}
