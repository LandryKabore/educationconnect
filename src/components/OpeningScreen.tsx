import { BrandLogo } from "@/components/BrandLogo";

/** Branded opening screen shown while the session is restored (Android app: same idea as iOS OpeningScreen). */
export function OpeningScreen() {
  return (
    <div
      role="status"
      aria-label="EduFaso, chargement"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-7 dark:bg-[var(--bg)]"
    >
      <BrandLogo className="h-40 w-auto max-w-[70vw]" imgClassName="h-40" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
        Système de gestion scolaire
      </p>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
    </div>
  );
}
