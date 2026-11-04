import type { ClassSection } from "@/lib/types";
import { Select } from "@/components/ui";

/**
 * Class filter for student lists: "Toutes les classes" by default (no need to pick a
 * class first), optionally "Sans classe".  Replaces the 40 truncated class pills.
 */
export function ClassFilter({
  id,
  value,
  onChange,
  classes,
  counts,
  total,
  withoutClassCount,
  showFormer,
  className,
}: {
  id: string;
  value: string;
  onChange: (classId: string) => void;
  classes: ClassSection[];
  counts: Record<string, number>;
  /** Number of students in the whole school (shown next to "Toutes les classes"). */
  total?: number;
  /** When set (> 0), a "Sans classe" option is offered. */
  withoutClassCount?: number;
  /** Offer "Anciens élèves" (pupils who left the school). */
  showFormer?: boolean;
  className?: string;
}) {
  return (
    <Select
      id={id}
      aria-label="Classe"
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">
        Toutes les classes{total != null ? ` (${total})` : ""}
      </option>
      {withoutClassCount && withoutClassCount > 0 ? (
        <option value="__none__">Sans classe ({withoutClassCount})</option>
      ) : null}
      {showFormer ? <option value="__former__">Anciens élèves (sortis)</option> : null}
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({counts[c.id] ?? 0})
        </option>
      ))}
    </Select>
  );
}
