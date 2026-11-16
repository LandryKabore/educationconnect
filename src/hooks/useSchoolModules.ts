import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  isMissingTableError,
  isSchoolRole,
  resolveLevel,
  resolveModuleStates,
  type AccessLevel,
  type ModuleKey,
  type RolePermissionRow,
  type SchoolModuleRow,
} from "@/lib/modules";

export interface SchoolModulesResult {
  rows: SchoolModuleRow[];
  permissions: RolePermissionRow[];
  /** The modules tables are not in this database yet: every module uses its default. */
  tableMissing: boolean;
  /** The role permissions table is not in this database yet: every role uses its default. */
  permissionsMissing: boolean;
}

export async function fetchSchoolModules(
  schoolId: string,
): Promise<SchoolModulesResult> {
  const [mods, perms] = await Promise.all([
    supabase
      .from("ecole_modules")
      .select("school_id, module_key, enabled, settings, updated_at")
      .eq("school_id", schoolId),
    supabase
      .from("ecole_role_permissions")
      .select("school_id, module_key, role, level")
      .eq("school_id", schoolId),
  ]);
  if (mods.error && !isMissingTableError(mods.error)) throw mods.error;
  if (perms.error && !isMissingTableError(perms.error)) throw perms.error;
  return {
    rows: (mods.error ? [] : (mods.data ?? [])) as SchoolModuleRow[],
    permissions: (perms.error ? [] : (perms.data ?? [])) as RolePermissionRow[],
    tableMissing: !!mods.error,
    permissionsMissing: !!perms.error,
  };
}

export function schoolModulesKey(schoolId: string | null | undefined) {
  return ["ecole-modules", schoolId ?? null] as const;
}

/** Saved module rows and role permissions of one school. */
export function useSchoolModules(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: schoolModulesKey(schoolId),
    enabled: !!schoolId,
    queryFn: () => fetchSchoolModules(schoolId!),
    staleTime: 60_000,
  });
}

/**
 * What the signed-in user can do in each module of their school.
 * Super admins outside support mode have no school: everything stays on.
 * While loading, or when the query fails, modules and roles use their defaults so
 * nobody loses a page because of a slow or broken request.
 */
export function useMyModules(): {
  /** the user's role sees this module (level above "aucun") */
  isOn: (key: ModuleKey) => boolean;
  levelOf: (key: ModuleKey) => AccessLevel;
  loading: boolean;
} {
  const { schoolId, role } = useAuth();
  const scoped = !!schoolId && isSchoolRole(role);
  const { data, isLoading } = useSchoolModules(scoped ? schoolId : null);
  const states = resolveModuleStates(scoped ? data?.rows : undefined);
  const levelOf = (key: ModuleKey): AccessLevel =>
    scoped && isSchoolRole(role)
      ? resolveLevel(key, role, states[key], data?.permissions)
      : "modifier";
  return {
    isOn: (key) => levelOf(key) !== "aucun",
    levelOf,
    loading: scoped && isLoading,
  };
}
