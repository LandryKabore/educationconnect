import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export type AuthPoint = { icon: LucideIcon; title: string; body: string };

/**
 * Layout of the pages around sign-in (first login, profile completion, password reset),
 * the same as the Connexion page: teal brand panel on the left, the form on the right,
 * a compact teal header on small screens.
 */
export function AuthShell({
  panelTitle,
  panelBody,
  points,
  title,
  subtitle,
  children,
  wide = false,
}: {
  panelTitle: string;
  panelBody?: string;
  /** small cards on the panel (wide screens) */
  points?: AuthPoint[];
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** wider form column (profile completion) */
  wide?: boolean;
}) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-12 dark:bg-[var(--bg)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white lg:col-span-6 lg:flex lg:flex-col xl:col-span-7">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <div className="my-auto max-w-xl py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">EduFaso</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight xl:text-[2.75rem]">{panelTitle}</h2>
            {panelBody ? <p className="mt-4 text-base font-medium text-white/85">{panelBody}</p> : null}
            {points && points.length > 0 ? (
              <ul className="mt-10 grid gap-3">
                {points.map((p) => (
                  <li key={p.title} className="flex gap-3 rounded-md bg-white/10 p-4 ring-1 ring-white/15">
                    <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-white/90" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{p.title}</span>
                      <span className="mt-0.5 block text-xs text-white/75">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="text-xs text-white/60">EduFaso · Burkina Faso</p>
        </div>
        <div className="relative flex h-1.5" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </aside>

      <main className="relative flex flex-col lg:col-span-6 xl:col-span-5">
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 pb-6 pt-8 text-white lg:hidden">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/[0.06]" />
          <p className="relative text-lg font-bold leading-snug">{panelTitle}</p>
        </div>
        <div className="absolute right-4 top-4 z-10 hidden lg:block">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div
            className={cn(
              "w-full",
              wide ? "max-w-lg" : "max-w-sm",
              // same field and button size as the Connexion page
              "[&_.h-11]:h-12 [&_.h-11]:rounded-md",
              "[&_label]:font-semibold [&_label]:text-slate-900 dark:[&_label]:text-slate-100",
              "[&_button[type=submit]]:h-12 [&_button[type=submit]]:w-full [&_button[type=submit]]:rounded-md [&_button[type=submit]]:font-bold",
            )}
          >
            <BrandLogo file="edufaso-logo-tight.png" className="mx-auto mb-8 h-20 w-auto max-w-[10rem]" imgClassName="h-20" />
            <h1 className="text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
            {subtitle ? <div className="mt-1.5 text-center text-sm text-slate-500">{subtitle}</div> : null}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
