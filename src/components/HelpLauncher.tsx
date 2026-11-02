import { lazy, Suspense, useState } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

// the dialog is loaded the first time someone opens the help
const HelpDialog = lazy(() =>
  import("@/components/HelpDialog").then((m) => ({ default: m.HelpDialog })),
);

/** « Aide » button: sidebar (desktop) or icon only (mobile header). */
export function HelpLauncher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Aide et signalement"
        title="Aide et signalement"
        className={cn(
          compact
            ? "rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            : "flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:text-slate-200",
          className,
        )}
      >
        <CircleHelp className={compact ? "h-5 w-5" : "h-4 w-4"} />
        {compact ? null : "Aide / Signaler un problème"}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <HelpDialog open={open} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
