import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const SPACE_LABEL: Record<string, string> = {
  student: "Espace élève",
  parent: "Espace parent",
  teacher: "Espace enseignant",
  school_admin: "Administration",
  super_admin: "Administration EduFaso",
};

export type BannerStatItem = { label: string; value: string; hint?: string; to?: string };

/**
 * Page header of the portals: the teal gradient banner with the flag stripe.
 * Drop-in for PageHeader (title / subtitle / actions); stats and aside are optional.
 */
export function PageBanner({
  title,
  subtitle,
  actions,
  eyebrow,
  stats,
  aside,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** small line above the title; defaults to the portal and the school */
  eyebrow?: string;
  stats?: BannerStatItem[];
  /** white card on the right (wide screens) */
  aside?: ReactNode;
  className?: string;
}) {
  const { role, schools, schoolId, supportSchoolId } = useAuth();
  // a super admin belongs to no school: the school shows only in Mode support
  const schoolName =
    role === "super_admin" && !supportSchoolId ? undefined : schools.find((s) => s.id === schoolId)?.name;
  const line =
    eyebrow ?? [role ? SPACE_LABEL[role] : null, schoolName].filter(Boolean).join(" · ");

  return (
    <section
      className={cn(
        "relative mb-6 overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/[0.06]" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-white/[0.04]" />
      <div
        className={cn(
          "relative grid gap-5 p-6 lg:px-8 lg:py-7",
          aside ? "lg:grid-cols-12 lg:items-center lg:gap-8" : "",
        )}
      >
        <div className={cn("min-w-0 space-y-4", aside ? "lg:col-span-7" : "")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              {line ? (
                <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-white/70">{line}</p>
              ) : null}
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1>
              {subtitle ? <div className="mt-1.5 text-sm font-medium text-white/85">{subtitle}</div> : null}
            </div>
            {actions ? (
              // page buttons were made for a white page: turn them into light buttons on the teal
              <div
                className={cn(
                  "flex shrink-0 flex-wrap gap-2",
                  "[&_button]:shadow-sm",
                  "[&_.bg-brand-700]:bg-white [&_.bg-brand-700]:text-brand-800 [&_.bg-brand-700:hover]:bg-brand-50",
                  "[&_.border-slate-300]:border-white/30 [&_.border-slate-300]:bg-white/10 [&_.border-slate-300]:text-white [&_.border-slate-300:hover]:bg-white/20",
                  "[&_.text-slate-700]:text-white [&_.text-slate-700:hover]:bg-white/15",
                )}
              >
                {actions}
              </div>
            ) : null}
          </div>
          {stats && stats.length > 0 ? (
            <div className={cn("grid gap-3", stats.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
              {stats.map((s) => (
                <BannerStatTile key={s.label} {...s} />
              ))}
            </div>
          ) : null}
        </div>
        {aside ? <div className="lg:col-span-5">{aside}</div> : null}
      </div>
      <div className="flex h-1" aria-hidden>
        <span className="flex-1 bg-faso-red" />
        <span className="flex-1 bg-faso-yellow" />
        <span className="flex-1 bg-faso-green" />
      </div>
    </section>
  );
}

function BannerStatTile({ label, value, hint, to }: BannerStatItem) {
  const body = (
    <>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-white/80">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-md bg-white/10 p-3.5 ring-1 ring-white/15";
  return to ? (
    <Link to={to} className={cn(cls, "transition hover:bg-white/15")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
