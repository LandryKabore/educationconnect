import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = crypto.getRandomValues(new Uint8Array(length));
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRoles } = await admin
      .from("roles_utilisateurs")
      .select("role, active")
      .eq("user_id", user.id)
      .eq("active", true);

    const isSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Réservé au super admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = String(body.action ?? "");
    const targetUserId = String(body.userId ?? body.user_id ?? "").trim();

    if (!action) {
      return new Response(JSON.stringify({ error: "action requise" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      ["reset_password", "force_password_change", "lock", "unlock"].includes(
        action,
      ) &&
      !targetUserId
    ) {
      return new Response(JSON.stringify({ error: "userId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // B-08: a super admin cannot lock their own account (the caller is an
    // active super admin, so locking anyone else can never remove the last one).
    if (action === "lock" && targetUserId === user.id) {
      return new Response(
        JSON.stringify({ error: "Vous ne pouvez pas verrouiller votre propre compte" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "reset_password") {
      const tempPassword = randomPassword(12);
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword,
        user_metadata: { must_change_password: true },
      });
      if (error) throw error;
      await admin
        .from("profils")
        .update({ must_change_password: true, active: true })
        .eq("id", targetUserId);
      // B-14: the stored hint belongs to the previous temporary password.
      await admin
        .from("identifiants_temporaires")
        .update({ temp_password_hint: null })
        .eq("user_id", targetUserId);
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "reset_password",
        entity_type: "user",
        entity_id: targetUserId,
        details: {},
      });
      return new Response(
        JSON.stringify({
          success: true,
          tempPassword,
          message: "Mot de passe temporaire généré",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "force_password_change") {
      await admin.auth.admin.updateUserById(targetUserId, {
        user_metadata: { must_change_password: true },
      });
      await admin
        .from("profils")
        .update({ must_change_password: true })
        .eq("id", targetUserId);
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "force_password_change",
        entity_type: "user",
        entity_id: targetUserId,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "lock") {
      const { error: profLockErr } = await admin
        .from("profils")
        .update({ active: false })
        .eq("id", targetUserId);
      if (profLockErr) throw profLockErr;
      // Only touch roles that are active right now, and remember them with
      // locked_at so unlock restores exactly these (not roles an admin
      // deliberately revoked earlier, e.g. "Administrateur retiré").
      const { error: roleLockErr } = await admin
        .from("roles_utilisateurs")
        .update({ active: false, locked_at: new Date().toISOString() })
        .eq("user_id", targetUserId)
        .eq("active", true);
      if (roleLockErr) throw roleLockErr;
      try {
        await admin.auth.admin.updateUserById(targetUserId, {
          ban_duration: "876000h",
        });
      } catch {
        // ban_duration may be unavailable on some projects — profils.active is enough
      }
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "lock_user",
        entity_type: "user",
        entity_id: targetUserId,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unlock") {
      const { error: profUnlockErr } = await admin
        .from("profils")
        .update({ active: true })
        .eq("id", targetUserId);
      if (profUnlockErr) throw profUnlockErr;

      // Restore the roles that lock deactivated.
      const { data: restored, error: restoreErr } = await admin
        .from("roles_utilisateurs")
        .update({ active: true, locked_at: null })
        .eq("user_id", targetUserId)
        .not("locked_at", "is", null)
        .select("id");
      if (restoreErr) throw restoreErr;

      let restoredCount = restored?.length ?? 0;
      if (restoredCount === 0) {
        // Legacy lock (before locked_at existed): nothing is marked. If the
        // user would be left with no active role at all, reactivate them
        // (except super_admin, which only an explicit grant may restore).
        const { count: activeCount } = await admin
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetUserId)
          .eq("active", true);
        if ((activeCount ?? 0) === 0) {
          const { data: legacy, error: legacyErr } = await admin
            .from("roles_utilisateurs")
            .update({ active: true })
            .eq("user_id", targetUserId)
            .neq("role", "super_admin") // never resurrect platform-admin rows
            .select("id");
          if (legacyErr) throw legacyErr;
          restoredCount = legacy?.length ?? 0;
        }
      }

      try {
        await admin.auth.admin.updateUserById(targetUserId, {
          ban_duration: "none",
        });
      } catch {
        // ignore
      }
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "unlock_user",
        entity_type: "user",
        entity_id: targetUserId,
        details: { restored_roles: restoredCount },
      });
      return new Response(JSON.stringify({ success: true, restoredRoles: restoredCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel_invite") {
      const inviteId = String(body.inviteId ?? "").trim();
      if (!inviteId) {
        return new Response(JSON.stringify({ error: "inviteId requis" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin
        .from("invitations")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", inviteId)
        .is("accepted_at", null)
        .is("cancelled_at", null);
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "cancel_invite",
        entity_type: "invitation",
        entity_id: inviteId,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur serveur",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
