import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the super admin portal: square cards with a small
 * radius, light type weights, quiet colour used only for status.
 */

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-normal tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
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
        "rounded-md border border-slate-200 bg-white",
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
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
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
      className="group block rounded-md border border-slate-200 bg-white p-4 transition hover:border-brand-300"
    >
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-3xl font-light tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Link>
  );
}

export function AdminSection({
  title,
  count,
  linkTo,
  linkLabel = "Tout voir",
  className,
  children,
}: {
  title: string;
  count?: number;
  linkTo?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AdminCard className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-900">
          {title}
          {count != null ? (
            <span className="ml-1.5 font-normal text-slate-500">{count}</span>
          ) : null}
        </h2>
        {linkTo ? (
          <Link
            to={linkTo}
            className="inline-flex items-center gap-0.5 text-xs text-brand-700 hover:underline"
          >
            {linkLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="flex-1">{children}</div>
    </AdminCard>
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
        <span className="block truncate text-sm text-slate-900">{primary}</span>
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
        <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  );
}
