import { supabase } from "@/lib/supabase";
import { parseAppVersionPolicy, type AppVersionPolicy } from "@/lib/appVersion";

/**
 * Read the public version policy. Returns null when offline, when the migration
 * is not applied yet, or when the request fails — the caller must not block writes.
 */
export async function fetchAppVersionPolicy(): Promise<AppVersionPolicy | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const { data, error } = await supabase.rpc("ef_app_version_policy");
    if (error || data == null) return null;
    return parseAppVersionPolicy(data);
  } catch {
    return null;
  }
}
