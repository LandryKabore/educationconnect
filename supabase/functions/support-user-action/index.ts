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
      await admin.from("profils").update({ active: false }).eq("id", targetUserId);
      await admin.from("roles_utilisateurs").update({ active: false }).eq(
        "user_id",
        targetUserId,
      );
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
      await admin.from("profils").update({ active: true }).eq("id", targetUserId);
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
      });
      return new Response(JSON.stringify({ success: true }), {
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
