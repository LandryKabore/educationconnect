import { timeToMinutes } from "@/lib/timetableConflicts";

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
};

/** DB day_of_week: 1 = Monday … 6 = Saturday (JS Sunday = 7 → 6 for schools). */
export function dbDayOfWeek(date = new Date()) {
  const js = date.getDay();
  return js === 0 ? 6 : js;
}

/** Day-chip default: today Mon–Sat, Monday when it's Sunday. */
export function defaultVisibleDay(date = new Date()) {
  const js = date.getDay();
  return js === 0 ? 1 : js;
}

export type SchoolWeekDay = {
  day: number;
  label: string;
  date: number;
  isToday: boolean;
  dateObj: Date;
};

/** Monday–Saturday of the current school week, with calendar dates. */
export function schoolWeekDays(today = new Date()): SchoolWeekDay[] {
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  const js = monday.getDay();
  monday.setDate(monday.getDate() + (js === 0 ? -6 : 1 - js));
  return [1, 2, 3, 4, 5, 6].map((day) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + day - 1);
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    return {
      day,
      label: WEEKDAY_SHORT[day] ?? "",
      date: date.getDate(),
      isToday,
      dateObj: date,
    };
  });
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
