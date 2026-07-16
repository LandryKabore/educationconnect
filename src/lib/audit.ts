import { supabase } from "@/lib/supabase";

export async function logAudit(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    details: details ?? {},
  });
}
