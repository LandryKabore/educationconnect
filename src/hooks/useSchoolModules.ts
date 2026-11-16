import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  isMissingTableError,
  resolveModuleStates,
  type ModuleKey,
  type SchoolModuleRow,
} from "@/lib/modules";

export interface SchoolModulesResult {
  rows: SchoolModuleRow[];
  /** The modules tables are not in this database yet: every module uses its default. */
  tableMissing: boolean;
}

export async function fetchSchoolModules(schoolId: string): Promise<SchoolModulesResult> {
  const { data, error } = await supabase
    .from("ecole_modules")
    .select("school_id, module_key, enabled, settings, updated_at")
    .eq("school_id", schoolId);
  if (error) {
    if (isMissingTableError(error)) return { rows: [], tableMissing: true };
    throw error;
  }
  return { rows: (data ?? []) as SchoolModuleRow[], tableMissing: false };
}

export function schoolModulesKey(schoolId: string | null | undefined) {
  return ["ecole-modules", schoolId ?? null] as const;
}

/** Saved module rows of one school (super admin page and the signed-in user's school). */
export function useSchoolModules(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: schoolModulesKey(schoolId),
    enabled: !!schoolId,
    queryFn: () => fetchSchoolModules(schoolId!),
    staleTime: 60_000,
  });
}

/**
 * On/off state of every module for the signed-in user's school.
 * Super admins outside support mode have no school: everything stays on.
 * While loading, or when the query fails, modules use their defaults so nobody
 * loses a page because of a slow or broken request.
 */
export function useMyModules(): {
  isOn: (key: ModuleKey) => boolean;
  loading: boolean;
} {
  const { schoolId, role } = useAuth();
  const scoped = !!schoolId && role !== "super_admin";
  const { data, isLoading } = useSchoolModules(scoped ? schoolId : null);
  const states = resolveModuleStates(scoped ? data?.rows : undefined);
  return {
    isOn: (key) => states[key],
    loading: scoped && isLoading,
  };
}
