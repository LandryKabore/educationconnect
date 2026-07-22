import { timeToMinutes } from "@/lib/timetableConflicts";

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

/** DB day_of_week: 1 = Monday … 6 = Saturday (JS Sunday = 7 → 6 for schools). */
export function dbDayOfWeek(date = new Date()) {
  const js = date.getDay();
  return js === 0 ? 6 : js;
}

export type ScheduleSlotBase = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type ScheduleFocus<T extends ScheduleSlotBase> = {
  slot: T;
  kind: "current" | "next";
  dayLabel: string;
  isLaterDay: boolean;
};

/** Current/next today, or first class on a later day. */
export function computeScheduleFocus<T extends ScheduleSlotBase>(
  weekSlots: T[],
  now = new Date(),
): ScheduleFocus<T> | null {
  if (weekSlots.length === 0) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDow = dbDayOfWeek(now);

  const todayList = weekSlots
    .filter((s) => s.day_of_week === todayDow)
    .sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
    );

  const current = todayList.find((s) => {
    const start = timeToMinutes(s.start_time);
    const end = timeToMinutes(s.end_time);
    return start <= nowMinutes && nowMinutes < end;
  });
  if (current) {
    return {
      slot: current,
      kind: "current",
      dayLabel: WEEKDAY_LABELS[todayDow] ?? "Aujourd’hui",
      isLaterDay: false,
    };
  }

  const nextToday = todayList.find(
    (s) => timeToMinutes(s.start_time) > nowMinutes,
  );
  if (nextToday) {
    return {
      slot: nextToday,
      kind: "next",
      dayLabel: WEEKDAY_LABELS[todayDow] ?? "Aujourd’hui",
      isLaterDay: false,
    };
  }

  for (let offset = 1; offset <= 7; offset++) {
    const day = ((todayDow - 1 + offset) % 7) + 1;
    const dayList = weekSlots
      .filter((s) => s.day_of_week === day)
      .sort(
        (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
      );
    const first = dayList[0];
    if (!first) continue;
    return {
      slot: first,
      kind: "next",
      dayLabel: WEEKDAY_LABELS[day] ?? "Prochain jour",
      isLaterDay: true,
    };
  }

  return null;
}
