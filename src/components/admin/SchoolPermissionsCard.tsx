import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";
import {
  ACCESS_LABELS,
  MODULES,
  ROLE_ACCESS,
  SCHOOL_ROLES,
  SCHOOL_ROLE_LABELS,
  levelsUpTo,
  resolveLevel,
  resolveModuleStates,
  type AccessLevel,
  type ModuleDef,
  type SchoolRole,
} from "@/lib/modules";
import { schoolModulesKey, useSchoolModules } from "@/hooks/useSchoolModules";
import { AdminCard, AdminLoading } from "@/components/admin/AdminKit";

const LEVEL_TONE: Record<AccessLevel, string> = {
  aucun: "text-slate-400",
  consulter: "text-slate-700",
  modifier: "text-brand-700",
};

/** Super admin: what each role can do in each module of one school. */
export function SchoolPermissionsCard({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useSchoolModules(schoolId);
  const [busy, setBusy] = useState<string | null>(null);

  const states = resolveModuleStates(data?.rows);
  const rows = data?.permissions;
  const missing = data?.permissionsMissing ?? false;
  const mods = MODULES.filter((m) => m.available && ROLE_ACCESS[m.key]);

  const change = async (
    mod: ModuleDef,
    role: SchoolRole,
    level: AccessLevel,
  ) => {
    const cell = `${mod.key}:${role}`;
    setBusy(cell);
    try {
      const { error } = await supabase
        .from("ecole_role_permissions")
        .upsert(
          { school_id: schoolId, module_key: mod.key, role, level },
          { onConflict: "school_id,module_key,role" },
        );
      if (error) throw error;
      void logAudit("permission_modifiee", "ecole", schoolId, {
        module: mod.key,
        role,
        niveau: level,
      });
      toast.success(
        `${SCHOOL_ROLE_LABELS[role]} · ${mod.name} : ${ACCESS_LABELS[level]}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible");
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: schoolModulesKey(schoolId) });
    }
  };

  return (
    <AdminCard className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-900">
          Permissions par rôle
        </h2>
        <p className="text-xs text-slate-500">
          Consulter : voir seulement. Modifier : voir et saisir. Aucun accès :
          le module disparaît pour ce rôle.
        </p>
      </div>

      {missing ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          La base de données n’a pas encore la table des permissions : chaque
          rôle garde ses accès par défaut.
        </p>
      ) : null}

      {isLoading ? (
        <AdminLoading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 font-medium">Module</th>
                {SCHOOL_ROLES.map((r) => (
                  <th key={r} className="px-3 py-2 font-medium">
                    {SCHOOL_ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mods.map((m) => {
                const on = states[m.key];
                return (
                  <tr
                    key={m.key}
                    className={cn(
                      "border-t border-slate-100 first:border-t-0",
                      !on && "bg-slate-50/60",
                    )}
                  >
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "block",
                          on ? "text-slate-900" : "text-slate-400",
                        )}
                      >
                        {m.name}
                      </span>
                      {!on ? (
                        <span className="block text-xs text-slate-400">
                          Module désactivé
                        </span>
                      ) : null}
                    </td>
                    {SCHOOL_ROLES.map((r) => {
                      const acc = ROLE_ACCESS[m.key]![r];
                      const level = resolveLevel(m.key, r, on, rows);
                      const options = levelsUpTo(acc.max);
                      const fixed = !on || options.length < 2;
                      const cell = `${m.key}:${r}`;
                      return (
                        <td key={r} className="px-3 py-2">
                          {fixed ? (
                            <span
                              className={cn(
                                "text-sm",
                                on ? LEVEL_TONE[level] : "text-slate-300",
                              )}
                            >
                              {acc.max === "aucun" ? "—" : ACCESS_LABELS[level]}
                            </span>
                          ) : (
                            <select
                              aria-label={`${m.name}, ${SCHOOL_ROLE_LABELS[r]}`}
                              value={level}
                              disabled={missing || !!busy}
                              onChange={(e) =>
                                void change(m, r, e.target.value as AccessLevel)
                              }
                              className={cn(
                                "w-full max-w-[9.5rem] rounded-sm border border-slate-200 bg-white px-2 py-1 text-sm transition focus:border-brand-500 focus:outline-none disabled:opacity-60",
                                LEVEL_TONE[level],
                                busy === cell && "animate-pulse",
                              )}
                            >
                              {options.map((l) => (
                                <option key={l} value={l}>
                                  {ACCESS_LABELS[l]}
                                  {l === acc.default ? " (par défaut)" : ""}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        « — » : ce rôle n’utilise pas ce module dans l’application. Les
        permissions sont appliquées dans l’application et par la base de
        données : un rôle en « Consulter » ne peut rien enregistrer.
      </p>
    </AdminCard>
  );
}
