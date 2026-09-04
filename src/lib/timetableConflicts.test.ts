import { describe, expect, it } from "vitest";
import {
  findTimetableConflicts,
  timesOverlap,
  timeToMinutes,
  type SlotLike,
} from "@/lib/timetableConflicts";

function slot(overrides: Partial<SlotLike> & { class_section_id: string }): SlotLike {
  return {
    id: crypto.randomUUID(),
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    ...overrides,
  };
}

describe("timeToMinutes", () => {
  it("parses HH:MM and HH:MM:SS the same way", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("08:30:00")).toBe(510);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

describe("timesOverlap", () => {
  it("detects a real overlap", () => {
    expect(timesOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
  });

  it("treats back-to-back slots as non-overlapping", () => {
    expect(timesOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
  });

  it("detects containment (one slot fully inside another)", () => {
    expect(timesOverlap("08:00", "10:00", "08:30", "09:00")).toBe(true);
  });
});

describe("findTimetableConflicts", () => {
  it("rejects an end time before the start time", () => {
    const candidate = slot({ class_section_id: "c1", start_time: "10:00", end_time: "09:00" });
    const conflicts = findTimetableConflicts(candidate, []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("range");
  });

  it("flags a double-booking for the same class on the same day", () => {
    const existing = [slot({ class_section_id: "c1" })];
    const candidate = slot({
      class_section_id: "c1",
      start_time: "08:30",
      end_time: "09:30",
    });
    const conflicts = findTimetableConflicts(candidate, existing);
    expect(conflicts.some((c) => c.type === "class")).toBe(true);
  });

  it("flags a teacher double-booked across two different classes", () => {
    const existing = [slot({ class_section_id: "c1", teacher_id: "t1" })];
    const candidate = slot({
      class_section_id: "c2",
      teacher_id: "t1",
      start_time: "08:30",
      end_time: "09:30",
    });
    const conflicts = findTimetableConflicts(candidate, existing);
    expect(conflicts.some((c) => c.type === "teacher")).toBe(true);
    // Different classes → must NOT also report a "class" conflict.
    expect(conflicts.some((c) => c.type === "class")).toBe(false);
  });

  it("flags a room clash between two different classes, case/space insensitive", () => {
    const existing = [slot({ class_section_id: "c1", room: " Salle A " })];
    const candidate = slot({
      class_section_id: "c2",
      room: "salle a",
      start_time: "08:30",
      end_time: "09:30",
    });
    const conflicts = findTimetableConflicts(candidate, existing);
    expect(conflicts.some((c) => c.type === "room")).toBe(true);
  });

  it("does not flag a room clash against itself for the same class", () => {
    const existing = [slot({ class_section_id: "c1", room: "Salle A" })];
    const candidate = slot({
      class_section_id: "c1",
      room: "Salle A",
      start_time: "08:30",
      end_time: "09:30",
    });
    const conflicts = findTimetableConflicts(candidate, existing);
    expect(conflicts.some((c) => c.type === "room")).toBe(false);
  });

  it("ignores slots on a different day entirely", () => {
    const existing = [slot({ class_section_id: "c1", day_of_week: 2 })];
    const candidate = slot({ class_section_id: "c1", day_of_week: 1 });
    expect(findTimetableConflicts(candidate, existing)).toHaveLength(0);
  });

  it("excludes the candidate's own row when editing an existing slot", () => {
    const existing = [slot({ id: "same-id", class_section_id: "c1" })];
    const candidate = slot({ id: "same-id", class_section_id: "c1" });
    expect(findTimetableConflicts(candidate, existing)).toHaveLength(0);
  });
});
