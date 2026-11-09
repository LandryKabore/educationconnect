import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { plural } from "@/lib/parentHome";

export type ChildAlertCounts = {
  absences: number;
  lates: number;
  notes: number;
  other: number;
};

export function emptyChildAlerts(): ChildAlertCounts {
  return { absences: 0, lates: 0, notes: 0, other: 0 };
}

export function childAlertTotal(counts: ChildAlertCounts): number {
  return counts.absences + counts.lates + counts.notes + counts.other;
}

/**
 * Parent presence alerts are stored as
 * « Prénom Nom · Absent|Retard · matière · date ». The status is the second segment.
 */
export function presenceAlertKind(label: string): "absence" | "late" | "other" {
  const status = label.split(" · ")[1];
  if (status === ATTENDANCE_LABELS.absent) return "absence";
  if (status === ATTENDANCE_LABELS.late) return "late";
  return "other";
}

/** Short French line for the child picker, or null when this child has no alert. */
export function childAlertLine(counts: ChildAlertCounts): string | null {
  const parts: string[] = [];
  if (counts.absences > 0) {
    parts.push(
      `${counts.absences} ${plural(counts.absences, "nouvelle absence", "nouvelles absences")}`,
    );
  }
  if (counts.lates > 0) {
    parts.push(
      `${counts.lates} ${plural(counts.lates, "nouveau retard", "nouveaux retards")}`,
    );
  }
  if (counts.notes > 0) {
    parts.push(
      `${counts.notes} ${plural(counts.notes, "nouvelle note", "nouvelles notes")}`,
    );
  }
  if (parts.length === 0 && counts.other > 0) {
    parts.push(`${counts.other} ${plural(counts.other, "alerte", "alertes")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Last-viewed child first; everyone else keeps the existing order. */
export function orderWithLastViewed<T extends { id: string }>(
  items: T[],
  lastId: string | null,
): T[] {
  if (!lastId) return items;
  const index = items.findIndex((item) => item.id === lastId);
  if (index <= 0) return items;
  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}
