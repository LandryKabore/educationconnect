import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { parseValidDate } from "@/lib/dateFr";

export function relativeFr(iso: string | null | undefined) {
  const d = parseValidDate(iso);
  if (!d) return "—";
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
}

export function snippet(text: string, max = 72) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
