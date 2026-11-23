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
import { ShieldCheck } from "lucide-react";
import { AdminCard, AdminCardHeader, AdminLoading } from "@/components/admin/AdminKit";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

const LEVEL_TONE: Record<AccessLevel, string> = {
  aucun: "text-slate-400",
  consulter: "text-slate-700",
  modifier: "text-brand-700",
};

const LEVEL_RANK: Record<AccessLevel, number> = {
  aucun: 0,
  consulter: 1,
  modifier: 2,
};

const ROLE_PEOPLE: Record<SchoolRole, string> = {
  school_admin: "Les membres de l’administration",
  teacher: "Les enseignants",
  student: "Les élèves",
  parent: "Les parents",
};

const LEVEL_EFFECT: Record<AccessLevel, (who: string, mod: string) => string> = {
  aucun: (who, mod) =>
    `${who} ne verront plus ${mod} : le module disparaît de leurs menus.`,
  consulter: (who, mod) =>
    `${who} pourront voir ${mod}, mais plus rien y ajouter, modifier ou supprimer.`,
  modifier: (who, mod) => `${who} pourront voir ${mod} et y saisir des données.`,
};

/** Super admin: what each role can do in each module of one school. */
export function SchoolPermissionsCard({
  schoolId,
  schoolName,
}: {
  schoolId: string;
  schoolName?: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useSchoolModules(schoolId);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    mod: ModuleDef;
    role: SchoolRole;
    from: AccessLevel;
    to: AccessLevel;
  } | null>(null);

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
      setPending(null);
      void qc.invalidateQueries({ queryKey: schoolModulesKey(schoolId) });
    }
  };

  return (
    <AdminCard className="mt-4 overflow-hidden">
      {pending ? (
        <AdminConfirmDialog
          open
          title="Modifier cette permission ?"
          confirmLabel="Confirmer"
          danger={LEVEL_RANK[pending.to] < LEVEL_RANK[pending.from]}
          busy={busy === `${pending.mod.key}:${pending.role}`}
          onConfirm={() => void change(pending.mod, pending.role, pending.to)}
          onCancel={() => setPending(null)}
        >
          <p>
            <span className="font-medium text-slate-900">
              {SCHOOL_ROLE_LABELS[pending.role]} · {pending.mod.name}
            </span>
            {" : "}
            {ACCESS_LABELS[pending.from]} → {ACCESS_LABELS[pending.to]}
            {schoolName ? ` à « ${schoolName} »` : ""}.
          </p>
          <p>{LEVEL_EFFECT[pending.to](ROLE_PEOPLE[pending.role], pending.mod.name)}</p>
        </AdminConfirmDialog>
      ) : null}
      <AdminCardHeader
        className="mb-0 border-b border-slate-200 px-4 py-3.5"
        icon={ShieldCheck}
        title="Permissions par rôle"
        subtitle="Consulter : voir seulement. Modifier : voir et saisir. Aucun accès : le module disparaît pour ce rôle."
      />

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
                            <span className="flex items-center gap-2">
                              <select
                                aria-label={`${m.name}, ${SCHOOL_ROLE_LABELS[r]}`}
                                value={level}
                                disabled={missing || !!busy}
                                onChange={(e) =>
                                  setPending({
                                    mod: m,
                                    role: r,
                                    from: level,
                                    to: e.target.value as AccessLevel,
                                  })
                                }
                                className={cn(
                                  "w-40 shrink-0 rounded-sm border bg-white px-2 py-1 text-sm transition focus:border-brand-500 focus:outline-none disabled:opacity-60",
                                  level === acc.default
                                    ? "border-slate-200"
                                    : "border-amber-400",
                                  LEVEL_TONE[level],
                                  busy === cell && "animate-pulse",
                                )}
                              >
                                {options.map((l) => (
                                  <option key={l} value={l}>
                                    {ACCESS_LABELS[l]}
                                    {l === acc.default ? " (défaut)" : ""}
                                  </option>
                                ))}
                              </select>
                              {level !== acc.default ? (
                                <span
                                  className="text-[11px] text-amber-700"
                                  title={`Par défaut : ${ACCESS_LABELS[acc.default]}`}
                                >
                                  Modifié
                                </span>
                              ) : null}
                            </span>
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
