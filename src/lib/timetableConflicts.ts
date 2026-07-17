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
};

export function findTimetableConflicts(
  candidate: SlotLike,
  existing: SlotLike[],
  labels?: {
    className?: string;
    teacherName?: string;
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
      });
    }

    if (
      candidate.teacher_id &&
      slot.teacher_id &&
      candidate.teacher_id === slot.teacher_id
    ) {
      const who = labels?.teacherName ?? "Cet enseignant";
      conflicts.push({
        type: "teacher",
        message: `${who} est déjà en cours (${otherClass}) à ${when}${detailSuffix}.`,
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
      });
    }
  }

  return conflicts;
}
