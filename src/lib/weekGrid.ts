import { useEffect, useMemo, useState } from "react";
import { timeToMinutes } from "@/lib/timetableConflicts";

type TimedSlot = { day_of_week: number; start_time: string; end_time: string };

export function todayDow(d = new Date()) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** Clock for the red "now" line; ticks every 30 s. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Slots grouped by day, and the hour range the grid must show. */
export function useWeekLayout<T extends TimedSlot>(slots: T[]) {
  const byDay = useMemo(() => {
    const m = new Map<number, T[]>();
    for (const s of slots) m.set(s.day_of_week, [...(m.get(s.day_of_week) ?? []), s]);
    return m;
  }, [slots]);
  const bounds = useMemo(() => {
    if (slots.length === 0) return { start: 7 * 60, end: 18 * 60 };
    return {
      start: Math.floor(Math.min(...slots.map((s) => timeToMinutes(s.start_time))) / 60) * 60,
      end: Math.ceil(Math.max(...slots.map((s) => timeToMinutes(s.end_time))) / 60) * 60,
    };
  }, [slots]);
  return { byDay, bounds };
}
