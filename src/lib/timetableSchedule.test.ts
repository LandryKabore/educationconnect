import { describe, expect, it } from "vitest";
import {
  computeScheduleFocus,
  dbDayOfWeek,
  WEEKDAY_LABELS,
  type ScheduleSlotBase,
} from "@/lib/timetableSchedule";

describe("dbDayOfWeek", () => {
  // Regression test: an earlier version mapped Sunday to 6 (Saturday),
  // which silently displayed Saturday's timetable on Sundays. The DB
  // constraint on creneaux_edt is `day_of_week between 1 and 7`, so Sunday
  // must map to 7, matching WEEKDAY_LABELS[7] = "Dimanche".
  it("maps every JS weekday to the 1 (Monday) .. 7 (Sunday) DB convention", () => {
    // 2026-07-20 is a Monday.
    const monday = new Date(2026, 6, 20);
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      expect(dbDayOfWeek(date)).toBe(i + 1);
    }
  });

  it("never collapses Sunday onto Saturday", () => {
    const sunday = new Date(2026, 6, 26);
    expect(sunday.getDay()).toBe(0);
    expect(dbDayOfWeek(sunday)).toBe(7);
    expect(dbDayOfWeek(sunday)).not.toBe(6);
  });

  it("has a label for every DB day value, including Sunday", () => {
    for (let day = 1; day <= 7; day++) {
      expect(WEEKDAY_LABELS[day]).toBeTruthy();
    }
  });
});

describe("computeScheduleFocus", () => {
  const baseSlot: ScheduleSlotBase = {
    id: "1",
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
  };

  it("returns null when there are no slots", () => {
    expect(computeScheduleFocus([], new Date(2026, 6, 20, 8, 30))).toBeNull();
  });

  it("finds the slot currently in progress today", () => {
    const now = new Date(2026, 6, 20, 8, 30); // Monday 08:30
    const result = computeScheduleFocus([baseSlot], now);
    expect(result?.kind).toBe("current");
    expect(result?.isLaterDay).toBe(false);
  });

  it("finds the next slot later today when none is in progress", () => {
    const now = new Date(2026, 6, 20, 7, 0); // Monday 07:00, before the slot
    const result = computeScheduleFocus([baseSlot], now);
    expect(result?.kind).toBe("next");
    expect(result?.isLaterDay).toBe(false);
  });

  it("rolls over to the first slot of the next day when today is done", () => {
    const tuesdaySlot: ScheduleSlotBase = { ...baseSlot, id: "2", day_of_week: 2 };
    const now = new Date(2026, 6, 20, 20, 0); // Monday evening, slot already passed
    const result = computeScheduleFocus([tuesdaySlot], now);
    expect(result?.isLaterDay).toBe(true);
    expect(result?.dayLabel).toBe("Mardi");
  });
});
