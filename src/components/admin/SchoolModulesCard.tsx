import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";
import {
  MODULES,
  MODULE_CATEGORY_LABELS,
  MODULE_CATEGORY_ORDER,
  dependentsOf,
  moduleDef,
  resolveModuleStates,
  type ModuleDef,
  type ModuleKey,
} from "@/lib/modules";
import { schoolModulesKey, useSchoolModules } from "@/hooks/useSchoolModules";
import { LayoutGrid } from "lucide-react";
import { AdminCard, AdminCardHeader, AdminLoading } from "@/components/admin/AdminKit";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

/** Super admin: turn each module on or off for one school. */
export function SchoolModulesCard({
  schoolId,
  schoolName,
}: {
  schoolId: string;
  schoolName?: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useSchoolModules(schoolId);
  const [busy, setBusy] = useState<ModuleKey | null>(null);
  const [pending, setPending] = useState<ModuleDef | null>(null);

  const states = resolveModuleStates(data?.rows);
  const tableMissing = data?.tableMissing ?? false;
  const activeCount = MODULES.filter(
    (m) => m.available && states[m.key],
  ).length;
  const availableCount = MODULES.filter((m) => m.available).length;

  const save = async (key: ModuleKey, enabled: boolean) => {
    const { error: err } = await supabase
      .from("ecole_modules")
      .upsert(
        { school_id: schoolId, module_key: key, enabled },
        { onConflict: "school_id,module_key" },
      );
    if (err) throw err;
  };

  const toggle = async (mod: ModuleDef) => {
    const next = !states[mod.key];
    setBusy(mod.key);
    try {
      const also: string[] = [];
      if (next) {
        // turn on what it needs first
        for (const req of mod.requires) {
          if (!states[req]) {
            await save(req, true);
            also.push(moduleDef(req)?.name ?? req);
          }
        }
        await save(mod.key, true);
      } else {
        // turn off what needs it first
        for (const dep of dependentsOf(mod.key)) {
          if (states[dep.key]) {
            await save(dep.key, false);
            also.push(dep.name);
          }
        }
        await save(mod.key, false);
      }
      void logAudit(
        next ? "module_active" : "module_desactive",
        "ecole",
        schoolId,
        {
          module: mod.key,
          aussi: also,
        },
      );
      toast.success(
        `${mod.name} ${next ? "activé" : "désactivé"}` +
          (also.length ? ` (et ${also.join(", ")})` : ""),
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
        <ModuleConfirm
          mod={pending}
          turningOn={!states[pending.key]}
          schoolName={schoolName}
          also={
            !states[pending.key]
              ? pending.requires
                  .filter((r) => !states[r])
                  .map((r) => moduleDef(r)?.name ?? r)
              : dependentsOf(pending.key)
                  .filter((d) => states[d.key])
                  .map((d) => d.name)
          }
          busy={busy === pending.key}
          onConfirm={() => void toggle(pending)}
          onCancel={() => setPending(null)}
        />
      ) : null}
      <AdminCardHeader
        className="mb-0 border-b border-slate-200 px-4 py-3.5"
        icon={LayoutGrid}
        title={
          <>
            Modules
            {!isLoading ? (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                {activeCount} sur {availableCount} activés
              </span>
            ) : null}
          </>
        }
        subtitle="Un module désactivé disparaît des menus de l’école, pour tous les rôles."
      />

      {tableMissing ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          La base de données n’a pas encore les tables des modules : l’école
          utilise tous les modules par défaut. Appliquez la migration «
          school_modules » pour pouvoir les modifier.
        </p>
      ) : null}
      {error ? (
        <p className="px-4 py-3 text-sm text-red-600">
          Impossible de charger les modules.
        </p>
      ) : null}

      {isLoading ? (
        <AdminLoading />
      ) : (
        <div className="-mb-px -mr-px grid sm:grid-cols-2 xl:grid-cols-3">
          {MODULE_CATEGORY_ORDER.map((cat) => {
            const mods = MODULES.filter((m) => m.category === cat);
            if (mods.length === 0) return null;
            return (
              <section
                key={cat}
                className="border-b border-r border-slate-200 bg-white"
              >
                <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {MODULE_CATEGORY_LABELS[cat]}
                </h3>
                <ul>
                  {mods.map((m) => (
                    <ModuleRow
                      key={m.key}
                      mod={m}
                      on={states[m.key]}
                      disabled={!m.available || tableMissing || !!busy}
                      busy={busy === m.key}
                      onToggle={() => setPending(m)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </AdminCard>
  );
}

function ModuleRow({
  mod,
  on,
  disabled,
  busy,
  onToggle,
}: {
  mod: ModuleDef;
  on: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const needs = mod.requires.map((r) => moduleDef(r)?.name ?? r);
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm text-slate-900">
          {mod.name}
          {!mod.available ? (
            <span className="rounded-sm border border-slate-200 px-1.5 py-px text-[10px] uppercase tracking-wide text-slate-500">
              Bientôt
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {mod.description}
          {needs.length ? ` Nécessite : ${needs.join(", ")}.` : ""}
        </span>
      </span>
      {mod.available ? (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${mod.name} : ${on ? "activé" : "désactivé"}`}
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
            on ? "bg-brand-600" : "bg-slate-300",
            busy && "animate-pulse",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white shadow transition",
              on ? "translate-x-[18px]" : "translate-x-0.5",
            )}
          />
        </button>
      ) : null}
    </li>
  );
}

function ModuleConfirm({
  mod,
  turningOn,
  schoolName,
  also,
  busy,
  onConfirm,
  onCancel,
}: {
  mod: ModuleDef;
  turningOn: boolean;
  schoolName?: string;
  also: string[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const school = schoolName ? `« ${schoolName} »` : "cette école";
  return (
    <AdminConfirmDialog
      open
      title={`${turningOn ? "Activer" : "Désactiver"} ${mod.name} ?`}
      confirmLabel={turningOn ? "Activer" : "Désactiver"}
      danger={!turningOn}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        {turningOn
          ? `${mod.name} apparaîtra dans les menus de ${school}, pour les rôles qui y ont accès.`
          : `${mod.name} disparaîtra des menus de ${school}, pour tous les rôles. Les données déjà saisies sont conservées.`}
      </p>
      {also.length ? (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          {turningOn ? "Sera aussi activé : " : "Sera aussi désactivé : "}
          {also.join(", ")}.
        </p>
      ) : null}
    </AdminConfirmDialog>
  );
}
