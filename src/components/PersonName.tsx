import { cn, personName } from "@/lib/utils";

type Props = {
  first?: string | null;
  last?: string | null;
  /** When set, used instead of first/last (already-resolved display string). */
  name?: string | null;
  className?: string;
  skeletonClassName?: string;
};

/** Shows a person name, or a pulse skeleton — never "Élève" / "Utilisateur". */
export function PersonName({
  first,
  last,
  name,
  className,
  skeletonClassName,
}: Props) {
  const resolved = (name?.trim() || personName(first, last)).trim();
  if (resolved) {
    return <span className={className}>{resolved}</span>;
  }
  return (
    <span
      className={cn(
        "inline-block h-4 w-28 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700",
        skeletonClassName,
        className,
      )}
      aria-hidden
    />
  );
}
