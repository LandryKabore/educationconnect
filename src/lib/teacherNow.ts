import { timeToMinutes } from "@/lib/timetableConflicts";

/** Roll call for one class slot on the teacher home (phone layout). */
export type AppelStatus = "done" | "partial" | "todo" | "empty";

export type NowSlot = {
  id: string;
  start_time: string;
  end_time: string;
  room: string | null;
  classId: string | null;
  subjectId: string | null;
  subjectName: string | null;
  className: string | null;
};

export type SlotKind = "current" | "next";

/**
 * Sunday is not a school day in this timetable (Monday–Saturday).
 * `dbDayOfWeek` maps Sunday onto Saturday, so the phone layout must
 * not treat that as "today".
 */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

export function formatHm(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function formatSlotRange(start: string, end: string): string {
  const a = formatHm(start);
  const b = formatHm(end);
  if (a && b) return `${a}–${b}`;
  return a || b;
}

/** French count: 0 and 2+ use the plural form. */
export function frCount(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Current slot, or the next one still to start today. */
export function pickFeaturedSlot<
  T extends { start_time: string; end_time: string },
>(todaySlots: readonly T[], now: Date): { slot: T; kind: SlotKind } | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...todaySlots].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
  );
  const current = sorted.find((slot) => {
    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    return start <= nowMinutes && nowMinutes < end;
  });
  if (current) return { slot: current, kind: "current" };
  const next = sorted.find((slot) => timeToMinutes(slot.start_time) > nowMinutes);
  if (next) return { slot: next, kind: "next" };
  return null;
}

export function appelStatus(
  studentCount: number | null,
  recorded: number,
): AppelStatus {
  if (studentCount === 0) return "empty";
  if (studentCount != null && studentCount > 0 && recorded >= studentCount) {
    return "done";
  }
  if (recorded > 0) return "partial";
  return "todo";
}

export function appelMeta(status: AppelStatus): string {
  switch (status) {
    case "done":
      return "appel fait";
    case "partial":
      return "appel en cours";
    case "empty":
      return "aucun élève";
    default:
      return "appel non fait";
  }
}

export function appelBadge(status: AppelStatus): string {
  switch (status) {
    case "done":
      return "Appel fait";
    case "partial":
      return "Appel en cours";
    case "empty":
      return "Aucun élève";
    default:
      return "Appel à faire";
  }
}

export function rollCallLabel(className: string | null): string {
  const name = className?.trim();
  if (!name) return "Faire l’appel";
  return `Faire l’appel de la ${name}`;
}

export function attendanceHref(
  classId: string,
  subjectId: string | null,
  date: string,
): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (subjectId) params.set("matiere", subjectId);
  const query = params.toString();
  return `/classes/${classId}/presences${query ? `?${query}` : ""}`;
}

export function notesHref(classId: string, subjectId: string | null): string {
  const params = new URLSearchParams();
  if (subjectId) params.set("subject", subjectId);
  const query = params.toString();
  return `/classes/${classId}/notes${query ? `?${query}` : ""}`;
}

/** Existing class travaux screen, where a teacher creates an exercice. */
export function homeworkHref(classId: string, subjectId: string | null): string {
  const params = new URLSearchParams({ from: "devoirs" });
  if (subjectId) params.set("subject", subjectId);
  return `/classes/${classId}/notes?${params.toString()}`;
}

export function nowMeta(opts: {
  room: string | null;
  studentCount: number | null;
  appel: AppelStatus;
}): string {
  const parts: string[] = [];
  const room = opts.room?.trim();
  if (room) parts.push(`Salle ${room}`);
  if (opts.studentCount != null) {
    parts.push(frCount(opts.studentCount, "élève", "élèves"));
  }
  parts.push(appelMeta(opts.appel));
  return parts.join(" · ");
}

export function slotTitle(slot: NowSlot): string {
  const title = [slot.subjectName, slot.className].filter(Boolean).join(" · ");
  return title || "Cours";
}

export type NowEmptyKind =
  | "sunday"
  | "no-timetable"
  | "no-class-today"
  | "day-finished";

export type SlotView = {
  slot: NowSlot;
  kind: SlotKind;
  studentCount: number | null;
  appel: AppelStatus;
};

export type MobileScheduleView = {
  empty: NowEmptyKind | null;
  nextDayLabel: string | null;
  featured: SlotView | null;
  rest: SlotView[];
};

function recordedFor(
  slot: NowSlot,
  recordedBySubject: Readonly<Record<string, number>>,
  recordedByClass: Readonly<Record<string, number>>,
): number {
  if (slot.classId && slot.subjectId) {
    return recordedBySubject[`${slot.classId}:${slot.subjectId}`] ?? 0;
  }
  if (slot.classId) return recordedByClass[slot.classId] ?? 0;
  return 0;
}

function studentsFor(
  slot: NowSlot,
  studentCountByClass: Readonly<Record<string, number>>,
): number | null {
  if (!slot.classId) return null;
  if (Object.prototype.hasOwnProperty.call(studentCountByClass, slot.classId)) {
    return studentCountByClass[slot.classId] ?? null;
  }
  return null;
}

function toSlotView(
  slot: NowSlot,
  kind: SlotKind,
  studentCountByClass: Readonly<Record<string, number>>,
  recordedBySubject: Readonly<Record<string, number>>,
  recordedByClass: Readonly<Record<string, number>>,
): SlotView {
  const studentCount = studentsFor(slot, studentCountByClass);
  return {
    slot,
    kind,
    studentCount,
    appel: appelStatus(
      studentCount,
      recordedFor(slot, recordedBySubject, recordedByClass),
    ),
  };
}

export function buildMobileSchedule(input: {
  isSunday: boolean;
  weekCount: number;
  todaySlots: readonly NowSlot[];
  now: Date;
  studentCountByClass: Readonly<Record<string, number>>;
  recordedBySubject: Readonly<Record<string, number>>;
  recordedByClass: Readonly<Record<string, number>>;
  nextDayLabel: string | null;
}): MobileScheduleView {
  if (input.isSunday) {
    return {
      empty: "sunday",
      nextDayLabel: null,
      featured: null,
      rest: [],
    };
  }

  const featuredPick = pickFeaturedSlot(input.todaySlots, input.now);
  let empty: NowEmptyKind | null = null;
  if (input.weekCount === 0) empty = "no-timetable";
  else if (input.todaySlots.length === 0) empty = "no-class-today";
  else if (!featuredPick) empty = "day-finished";

  const featured = featuredPick
    ? toSlotView(
        featuredPick.slot,
        featuredPick.kind,
        input.studentCountByClass,
        input.recordedBySubject,
        input.recordedByClass,
      )
    : null;

  const rest = [...input.todaySlots]
    .filter((slot) => slot.id !== featured?.slot.id)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    .map((slot) =>
      toSlotView(
        slot,
        "next",
        input.studentCountByClass,
        input.recordedBySubject,
        input.recordedByClass,
      ),
    );

  return {
    empty,
    nextDayLabel: empty === "no-class-today" ? input.nextDayLabel : null,
    featured,
    rest,
  };
}
