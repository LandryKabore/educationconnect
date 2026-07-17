import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function randomPassword(length = 10) {
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

    const body = await req.json();
    const action = String(body.action ?? "").trim();
    const targetUserId = String(body.userId ?? body.user_id ?? "").trim();
    const schoolId = String(body.schoolId ?? body.school_id ?? "").trim();

    if (!action || !targetUserId || !schoolId) {
      return new Response(
        JSON.stringify({ error: "action, userId et schoolId requis" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: callerRoles } = await admin
      .from("roles_utilisateurs")
      .select("role, school_id, active")
      .eq("user_id", user.id)
      .eq("active", true);

    const canSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    const canSchoolAdmin = (callerRoles ?? []).some(
      (r) => r.role === "school_admin" && r.school_id === schoolId,
    );
    if (!canSuper && !canSchoolAdmin) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetRole } = await admin
      .from("roles_utilisateurs")
      .select("role, school_id, active")
      .eq("user_id", targetUserId)
      .eq("school_id", schoolId)
      .eq("active", true)
      .maybeSingle();

    if (!targetRole) {
      return new Response(
        JSON.stringify({ error: "Utilisateur introuvable dans cette école" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: profil } = await admin
      .from("profils")
      .select("email")
      .eq("id", targetUserId)
      .maybeSingle();

    if (action === "reset_password") {
      const tempPassword = randomPassword(10);
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword,
        user_metadata: { must_change_password: true },
      });
      if (error) throw error;

      await admin
        .from("profils")
        .update({ must_change_password: true, active: true })
        .eq("id", targetUserId);

      const { data: existingCred } = await admin
        .from("identifiants_temporaires")
        .select("id, username")
        .eq("user_id", targetUserId)
        .maybeSingle();

      const username =
        existingCred?.username ??
        (profil?.email?.endsWith("@edufaso.local")
          ? profil.email.replace("@edufaso.local", "")
          : profil?.email) ??
        targetUserId.slice(0, 8);

      if (existingCred?.id) {
        await admin
          .from("identifiants_temporaires")
          .update({
            temp_password_hint: tempPassword,
            used: false,
            username,
          })
          .eq("id", existingCred.id);
      } else {
        await admin.from("identifiants_temporaires").insert({
          user_id: targetUserId,
          username,
          temp_password_hint: tempPassword,
          used: false,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          username,
          tempPassword,
          message: "Nouveau mot de passe temporaire généré",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "recovery_link") {
      const email = profil?.email;
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Pas d’email technique pour ce compte" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const redirectTo =
        String(body.redirectTo ?? body.redirect_to ?? "").trim() || undefined;

      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw error;

      const actionLink =
        data.properties?.action_link ??
        (data as { action_link?: string }).action_link ??
        null;

      if (!actionLink) {
        return new Response(
          JSON.stringify({ error: "Impossible de générer le lien" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          recoveryLink: actionLink,
          message: "Lien de réinitialisation généré",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
