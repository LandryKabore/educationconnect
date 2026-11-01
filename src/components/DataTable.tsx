import { Fragment, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Extra classes for the header and cells. */
  className?: string;
  /** Hide this column on screens narrower than `lg` (1024 px). */
  hideBelowLg?: boolean;
};

function RowCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  );
}

/**
 * Dense table (md and wider) that becomes a list of two-line cards on a phone.
 * Selection is optional: pass `selectedIds`, `onToggle` and `onTogglePage`.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  mobileRow,
  selectedIds,
  onToggle,
  onTogglePage,
  rowLabel,
  dimmed = false,
  detail,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  /** Content of a card on a phone (the checkbox is added on the left). */
  mobileRow: (row: T) => React.ReactNode;
  selectedIds?: ReadonlySet<string>;
  onToggle?: (row: T) => void;
  onTogglePage?: (rows: T[], on: boolean) => void;
  /** Accessible name of a row's checkbox. */
  rowLabel?: (row: T) => string;
  /** Fade the rows while a new page is loading. */
  dimmed?: boolean;
  /** Optional full-width panel under a row (return null when the row is closed). */
  detail?: (row: T) => React.ReactNode;
}) {
  const selectable = !!selectedIds && !!onToggle && !!onTogglePage;
  const selectedOnPage = selectable
    ? rows.filter((r) => selectedIds.has(r.id)).length
    : 0;
  const allOnPage = rows.length > 0 && selectedOnPage === rows.length;

  return (
    <div className={cn("transition-opacity", dimmed && "opacity-60")}>
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-[var(--surface-2)]">
              {selectable ? (
                <th className="w-10 px-4 py-3">
                  <RowCheckbox
                    checked={allOnPage}
                    indeterminate={selectedOnPage > 0}
                    onChange={() => onTogglePage(rows, !allOnPage)}
                    label="Sélectionner toute la page"
                  />
                </th>
              ) : null}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-3 font-medium",
                    c.hideBelowLg && "hidden lg:table-cell",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selectable && selectedIds.has(row.id);
              const extra = detail?.(row);
              return (
                <Fragment key={row.id}>
                <tr
                  className={cn(
                    "border-b border-slate-100 align-top last:border-0 dark:border-slate-700",
                    checked
                      ? "bg-brand-50/60 dark:bg-brand-900/25"
                      : "hover:bg-slate-50/70 dark:hover:bg-[var(--surface-2)]",
                  )}
                >
                  {selectable ? (
                    <td className="px-4 py-3">
                      <RowCheckbox
                        checked={checked}
                        onChange={() => onToggle(row)}
                        label={rowLabel?.(row) ?? "Sélectionner la ligne"}
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-3",
                        c.hideBelowLg && "hidden lg:table-cell",
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
                {extra ? (
                  <tr className="border-b border-slate-100 bg-slate-50/60 last:border-0 dark:border-slate-700 dark:bg-slate-800/40">
                    <td
                      colSpan={columns.length + (selectable ? 1 : 0)}
                      className="px-4 py-3"
                    >
                      {extra}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 md:hidden dark:divide-slate-700">
        {selectable ? (
          <li className="flex items-center gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 dark:bg-[var(--surface-2)]">
            <RowCheckbox
              checked={allOnPage}
              indeterminate={selectedOnPage > 0}
              onChange={() => onTogglePage(rows, !allOnPage)}
              label="Sélectionner toute la page"
            />
            Sélectionner la page
          </li>
        ) : null}
        {rows.map((row) => {
          const checked = selectable && selectedIds.has(row.id);
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3",
                checked && "bg-brand-50/60 dark:bg-brand-900/25",
              )}
            >
              {selectable ? (
                <span className="mt-2.5">
                  <RowCheckbox
                    checked={checked}
                    onChange={() => onToggle(row)}
                    label={rowLabel?.(row) ?? "Sélectionner la ligne"}
                  />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                {mobileRow(row)}
                {detail?.(row)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
