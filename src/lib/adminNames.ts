import { supabase } from "@/lib/supabase";

type Person = { first_name: string; last_name: string } | null;

const ADMINISTRATION: Person = { first_name: "Administration", last_name: "" };

/** The active administrators of these schools. */
export async function fetchSchoolAdminIds(schoolIds: (string | null | undefined)[]): Promise<Set<string>> {
  const ids = [...new Set(schoolIds.filter((s): s is string => !!s))];
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from("roles_utilisateurs")
    .select("user_id")
    .in("school_id", ids)
    .eq("role", "school_admin")
    .eq("active", true);
  return new Set(((data ?? []) as { user_id: string | null }[]).map((r) => r.user_id).filter((u): u is string => !!u));
}

/**
 * School administrators appear as « Administration », never by name, wherever a message shows
 * its sender or recipient (messages, homes).
 */
export async function hideAdminNames<
  T extends { school_id?: string | null; sender_id?: string | null; recipient_id?: string | null; sender?: Person; recipient?: Person },
>(rows: T[]): Promise<T[]> {
  const admins = await fetchSchoolAdminIds(rows.map((r) => r.school_id));
  if (admins.size === 0) return rows;
  return rows.map((r) => ({
    ...r,
    ...(r.sender_id && admins.has(r.sender_id) && "sender" in r ? { sender: ADMINISTRATION } : {}),
    ...(r.recipient_id && admins.has(r.recipient_id) && "recipient" in r ? { recipient: ADMINISTRATION } : {}),
  }));
}
