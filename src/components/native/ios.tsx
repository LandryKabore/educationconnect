import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small kit that mirrors the SwiftUI building blocks of the iOS app (EduTheme + the
 * summary cards / captions used by every list screen). Only used in the Android app.
 */
export const INK = "text-[#0f172a] dark:text-slate-100";
export const MUTED = "text-[#64748b] dark:text-slate-300";
export const IOS = {
  teal: "#0f766e",
  navy: "#153064",
  red: "#d4372e",
  yellow: "#efac42",
  green: "#4b8f4a",
  orange: "#ff9500",
  sky: "#0284c7",
  muted: "#64748b",
  ink: "#0f172a",
} as const;

/** Color.opacity(0.12) on a #rrggbb color. */
export const tint = (hex: string, alpha = "1f") => `${hex}${alpha}`;
export const rgb = (c: readonly [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Summary card: 52 pt tinted circle + caption2 / headline / caption. */
export function SummaryCard({
  color,
  icon,
  caption,
  title,
  detail,
}: {
  color: string;
  icon: ReactNode;
  caption: string;
  title: string;
  detail?: string | null;
}) {
  return (
    <div className="ios-card flex items-center gap-[14px] p-4">
      <span
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: tint(color), color }}
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className={cn("truncate text-[11px] font-bold uppercase tracking-[0.5px]", MUTED)}>{caption}</p>
        <p className={cn("text-[17px] font-semibold leading-snug", INK)}>{title}</p>
        {detail ? <p className={cn("text-xs", MUTED)}>{detail}</p> : null}
      </div>
    </div>
  );
}

/** « MATIÈRES    10 » section caption. */
export function SectionCaption({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between text-xs font-bold uppercase tracking-[0.6px]", MUTED)}>
      <span>{children}</span>
      {right != null ? <span className="font-semibold normal-case tracking-normal">{right}</span> : null}
    </div>
  );
}

/** Capsule badge: color on color@12%. */
export function Capsule({
  color,
  children,
  className,
  style,
}: {
  color: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-bold leading-tight", className)}
      style={{ color, backgroundColor: tint(color), ...style }}
    >
      {children}
    </span>
  );
}

/** ContentUnavailableView (PremiumEmpty). */
export function IosEmpty({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span className="text-[#64748b]/70 [&>svg]:h-12 [&>svg]:w-12">{icon}</span>
      <p className={cn("text-[20px] font-bold", INK)}>{title}</p>
      <p className={cn("text-[15px]", MUTED)}>{message}</p>
    </div>
  );
}
