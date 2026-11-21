import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { PageBanner, type BannerStatItem } from "@/components/PageBanner";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the super admin portal, in the portals' design: teal banner,
 * square cards with an icon header, colour used only for status.
 */

/** Page header of the super admin portal: the same teal banner as the other portals. */
export function AdminPageHeader({
  title,
  subtitle,
  actions,
  stats,
  aside,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  stats?: BannerStatItem[];
  aside?: ReactNode;
}) {
  return <PageBanner title={title} subtitle={subtitle} actions={actions} stats={stats} aside={aside} />;
}

export function AdminCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-slate-200/80 bg-white shadow-sm dark:border-slate-600 dark:bg-[var(--surface-1)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

const TONE_DOT = {
  neutral: "bg-slate-400",
  brand: "bg-brand-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
} as const;

export type AdminTone = keyof typeof TONE_DOT;

export function AdminStatusDot({
  tone,
  label,
}: {
  tone: AdminTone;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
      {label}
    </span>
  );
}

export function AdminStat({
  to,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  to: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: AdminTone;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-md border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Link>
  );
}

export function AdminSection({
  title,
  icon: Icon,
  subtitle,
  count,
  linkTo,
  linkLabel = "Tout voir",
  action,
  className,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  count?: number;
  linkTo?: string;
  linkLabel?: string;
  /** button(s) on the right of the header */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AdminCard className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {title}
              {count != null ? (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">{count}</span>
              ) : null}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {linkTo ? (
            <Link
              to={linkTo}
              className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline"
            >
              {linkLabel}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </AdminCard>
  );
}

/** Icon + title header for a card's own content (same look as AdminSection's header). */
export function AdminCardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Divided list inside an AdminSection. */
export function AdminList({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}

export function AdminListRow({
  to,
  primary,
  secondary,
  aside,
}: {
  to?: string;
  primary: ReactNode;
  secondary?: ReactNode;
  aside?: ReactNode;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{primary}</span>
        {secondary ? (
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {secondary}
          </span>
        ) : null}
      </span>
      {aside ? <span className="shrink-0 text-right">{aside}</span> : null}
    </>
  );
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      {to ? (
        <Link
          to={to}
          className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

export function AdminEmpty({ message }: { message: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{message}</p>;
}

export function AdminLoading() {
  return (
    <div className="space-y-2 px-4 py-4" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />
      ))}
    </div>
  );
}
