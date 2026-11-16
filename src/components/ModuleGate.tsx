import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Blocks } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyModules } from "@/hooks/useSchoolModules";
import { moduleForPath } from "@/lib/modules";

/**
 * Shows the page only when its module is on for the user's school.
 * A link or bookmark to a disabled module lands on a short explanation instead.
 */
export function ModuleGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { homePath } = useAuth();
  const { isOn } = useMyModules();
  const mod = moduleForPath(pathname);

  if (!mod || isOn(mod.key)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400">
        <Blocks className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </div>
      <h1 className="text-xl font-normal text-slate-900">
        {mod.name} n’est pas disponible
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Ce module n’est pas activé pour votre établissement, ou votre compte n’y
        a pas accès. Contactez l’administration de l’école ou l’équipe EduFaso.
      </p>
      <Link
        to={homePath}
        className="mt-6 inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
      >
        Retour à l’accueil
      </Link>
    </div>
  );
}
