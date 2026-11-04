import { cn } from "@/lib/utils";

/** Ring with a centred label, used by the parent home cards (average /20, attendance %). */
export function ProgressRing({
  fraction,
  label,
  tone,
}: {
  /** 0–1, null = no data */
  fraction: number | null;
  label: string;
  tone: string;
}) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, fraction ?? 0));
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-600" />
        {fraction === null ? null : (
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${pct * c} ${c}`}
            className={cn("stroke-current", tone)}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-slate-900 dark:text-slate-100">
        {label}
      </span>
    </div>
  );
}
