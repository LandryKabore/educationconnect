import { useCallback, useMemo, useState } from "react";

/**
 * Rows ticked in a paged list.  The selection survives page changes, so whole rows
 * (not just ids) are kept: a bulk action can then use them without asking again.
 */
export function useRowSelection<T extends { id: string }>() {
  const [selected, setSelected] = useState<Map<string, T>>(() => new Map());

  const toggle = useCallback((row: T) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  }, []);

  const setMany = useCallback((rows: T[], on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const row of rows) {
        if (on) next.set(row.id, row);
        else next.delete(row.id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  const rows = useMemo(() => [...selected.values()], [selected]);
  const ids = useMemo(() => new Set(selected.keys()), [selected]);

  return { selected, rows, ids, count: selected.size, toggle, setMany, clear };
}
