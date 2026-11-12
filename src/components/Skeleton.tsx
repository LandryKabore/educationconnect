import { cn } from "@/lib/utils";

/** Grey pulsing block. Reserves the final size of the content: no layout shift when data arrives. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-xl bg-slate-200/80 dark:bg-[var(--surface-2)]",
        className,
      )}
    />
  );
}

type Variant = "list" | "cards" | "home" | "timeline";

/**
 * Skeleton shown while a student screen loads (replaces a bare « Chargement… »).
 * Heights match the real cards so nothing jumps when the data arrives.
 */
export function ScreenSkeleton({
  variant = "list",
  label = "Chargement…",
}: {
  variant?: Variant;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {variant === "home" ? (
        <>
          <Skeleton className="h-16" />
          <Skeleton className="h-36" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-44" />
        </>
      ) : variant === "cards" ? (
        <>
          <Skeleton className="h-11" />
          <Skeleton className="h-24" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </>
      ) : variant === "timeline" ? (
        <>
          <Skeleton className="h-11" />
          <Skeleton className="h-16" />
          <Skeleton className="h-20" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </>
      ) : (
        [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)
      )}
    </div>
  );
}
