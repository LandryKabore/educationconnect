import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CLASS_COLOR_DOT,
  CLASS_COLOR_SOFT,
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";

type Props = {
  id?: string | null;
  name: string;
  className?: string;
  /** Show name text (default true). */
  label?: boolean;
};

/** Colored chip for a class — same hue everywhere for that class. */
export function ClassColorBadge({
  id,
  name,
  className,
  label = true,
}: Props) {
  return (
    <span
      data-class-color
      style={classColorVars({ id, name })}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold",
        CLASS_COLOR_SURFACE,
        className,
      )}
    >
      <span
        data-class-color
        style={classColorVars({ id, name })}
        className={cn("h-2 w-2 shrink-0 rounded-full", CLASS_COLOR_DOT)}
      />
      {label ? <span className="truncate">{name}</span> : null}
    </span>
  );
}

/** Soft tinted row / card background for class lists. */
export function ClassColorSurface({
  id,
  name,
  className,
  children,
}: Props & { children: ReactNode }) {
  return (
    <div
      data-class-color
      style={classColorVars({ id, name })}
      className={cn("rounded-xl border", CLASS_COLOR_SOFT, className)}
    >
      {children}
    </div>
  );
}

/** Small color swatch only. */
export function ClassColorDot({
  id,
  name,
  className,
}: Omit<Props, "label">) {
  return (
    <span
      data-class-color
      style={classColorVars({ id, name })}
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        CLASS_COLOR_DOT,
        className,
      )}
      title={name}
      aria-hidden
    />
  );
}
