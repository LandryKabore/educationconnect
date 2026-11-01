import { X } from "lucide-react";

/**
 * Floating bar shown while rows are selected.  `children` are the actions;
 * the clear button is built in.
 */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  /** Singular noun, e.g. "élève". */
  noun: string;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Actions groupées"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl lg:left-[19.5rem] lg:right-6 dark:bg-slate-700"
    >
      <p className="font-semibold">
        {count} {noun}
        {count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""}
      </p>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
        aria-label="Tout désélectionner"
        title="Tout désélectionner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
