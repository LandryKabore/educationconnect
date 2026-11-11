/** Timetable overlap / collision helpers. */

export type SlotLike = {
  id?: string;
  class_section_id: string;
  teacher_id?: string | null;
  room?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

/** Normalize "08:00" or "08:00:00" to minutes since midnight. */
export function timeToMinutes(t: string): number {
  const parts = t.slice(0, 5).split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as < be && bs < ae;
}

export type TimetableConflict = {
  type: "class" | "teacher" | "room" | "range";
  message: string;
  /** The other créneau involved, when this is an overlap rather than a bad range. */
  otherSlotId?: string;
};

export type SlotConflictBadge = "prof" | "salle" | "classe";

export type VisibleTimetableConflict = {
  key: string;
  type: "class" | "teacher" | "room";
  message: string;
  /** Visible créneau the « Ouvrir » action edits. */
  slotId: string;
  otherSlotId: string;
  otherClassId: string;
  day: number;
  startTime: string;
  endTime: string;
};

export function findTimetableConflicts(
  candidate: SlotLike,
  existing: SlotLike[],
  labels?: {
    className?: string;
    teacherName?: string;
    /** Used when each candidate has a different teacher (grid-wide check). */
    teacherNameFor?: (slot: SlotLike) => string | undefined;
    otherClassName?: (id: string) => string;
    /** Extra detail for an existing slot (matière, enseignant, salle…) */
    describeSlot?: (slot: SlotLike) => string;
  },
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const start = candidate.start_time;
  const end = candidate.end_time;

  if (!start || !end || timeToMinutes(end) <= timeToMinutes(start)) {
    conflicts.push({
      type: "range",
      message: "L’heure de fin doit être après l’heure de début.",
    });
    return conflicts;
  }

  const day = candidate.day_of_week;
  const roomKey = candidate.room?.trim().toLowerCase() || "";

  for (const slot of existing) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.day_of_week !== day) continue;
    if (!timesOverlap(start, end, slot.start_time, slot.end_time)) continue;

    const when = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`;
    const otherClass =
      labels?.otherClassName?.(slot.class_section_id) ?? "une autre classe";
    const detail = labels?.describeSlot?.(slot);
    const detailSuffix = detail ? ` : ${detail}` : "";

    if (slot.class_section_id === candidate.class_section_id) {
      conflicts.push({
        type: "class",
        message: `Cette classe a déjà un cours à ${when}${detailSuffix}.`,
        otherSlotId: slot.id,
      });
    }

    if (
      candidate.teacher_id &&
      slot.teacher_id &&
      candidate.teacher_id === slot.teacher_id
    ) {
      const who =
        labels?.teacherName ??
        labels?.teacherNameFor?.(candidate) ??
        "Cet enseignant";
      conflicts.push({
        type: "teacher",
        message: `${who} est déjà en cours (${otherClass}) à ${when}${detailSuffix}.`,
        otherSlotId: slot.id,
      });
    }

    if (
      roomKey &&
      slot.room?.trim().toLowerCase() === roomKey &&
      slot.class_section_id !== candidate.class_section_id
    ) {
      conflicts.push({
        type: "room",
        message: `La salle « ${candidate.room!.trim()} » est déjà prise (${otherClass}) à ${when}${detailSuffix}.`,
        otherSlotId: slot.id,
      });
    }
  }

  return conflicts;
}

const BADGE_ORDER: SlotConflictBadge[] = ["prof", "salle", "classe"];

function badgeFor(type: VisibleTimetableConflict["type"]): SlotConflictBadge {
  if (type === "teacher") return "prof";
  if (type === "room") return "salle";
  return "classe";
}

/**
 * Conflicts for the créneaux on screen, checked against every saved slot
 * (a teacher or a room can clash with another class). Each pair is listed once,
 * from the point of view of a visible créneau.
 */
export function collectVisibleConflicts(
  visible: SlotLike[],
  all: SlotLike[],
  labels?: Parameters<typeof findTimetableConflicts>[2],
): VisibleTimetableConflict[] {
  const seen = new Set<string>();
  const out: VisibleTimetableConflict[] = [];

  for (const slot of visible) {
    if (!slot.id) continue;
    const conflicts = findTimetableConflicts(slot, all, labels);
    for (const conflict of conflicts) {
      if (conflict.type === "range" || !conflict.otherSlotId) continue;
      const key = `${conflict.type}:${[slot.id, conflict.otherSlotId].sort().join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const other = all.find((item) => item.id === conflict.otherSlotId);
      out.push({
        key,
        type: conflict.type,
        message: conflict.message,
        slotId: slot.id,
        otherSlotId: conflict.otherSlotId,
        otherClassId: other?.class_section_id ?? slot.class_section_id,
        day: slot.day_of_week,
        startTime: slot.start_time,
        endTime: slot.end_time,
      });
    }
  }

  out.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });
  return out;
}

export function badgesForSlots(
  conflicts: VisibleTimetableConflict[],
  alsoOnSlotIds?: ReadonlySet<string>,
): Record<string, SlotConflictBadge[]> {
  const map = new Map<string, Set<SlotConflictBadge>>();
  const add = (slotId: string, badge: SlotConflictBadge) => {
    const set = map.get(slotId) ?? new Set<SlotConflictBadge>();
    set.add(badge);
    map.set(slotId, set);
  };
  for (const conflict of conflicts) {
    const badge = badgeFor(conflict.type);
    add(conflict.slotId, badge);
    if (alsoOnSlotIds?.has(conflict.otherSlotId)) add(conflict.otherSlotId, badge);
  }
  const record: Record<string, SlotConflictBadge[]> = {};
  for (const [id, set] of map) {
    record[id] = BADGE_ORDER.filter((badge) => set.has(badge));
  }
  return record;
}
