import { Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyModules } from "@/hooks/useSchoolModules";
import { moduleDef, type ModuleKey } from "@/lib/modules";

/**
 * True when the user's role can only view this module ("Consulter") although the
 * app lets that role edit it by default. Pages use it to lock their inputs.
 */
export function useModuleReadOnly(key: ModuleKey): boolean {
  const { role } = useAuth();
  const { levelOf } = useMyModules();
  return (
    (role === "teacher" || role === "school_admin") &&
    levelOf(key) === "consulter"
  );
}

/** Shown on a page whose module the user can only view. */
export function ReadOnlyBanner({
  module,
  detail,
}: {
  module: ModuleKey;
  /** replaces the default « ajouter, modifier ou supprimer » sentence */
  detail?: string;
}) {
  const name = moduleDef(module)?.name ?? module;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:text-slate-200"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <p>
        <span className="font-medium">{name} : consultation seulement.</span>{" "}
        {detail ??
          "Votre établissement vous donne accès en lecture à ce module. Vous pouvez tout voir, mais pas ajouter, modifier ou supprimer."}
      </p>
    </div>
  );
}
