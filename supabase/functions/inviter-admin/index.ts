import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const inviteSite =
      Deno.env.get("INVITE_SITE_URL") ||
      "https://edufaso.lovable.app";

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
      .select("role, school_id, active")
      .eq("user_id", user.id)
      .eq("active", true);

    const canSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    if (!canSuper) {
      return new Response(JSON.stringify({ error: "Réservé au super admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const schoolId = String(body.schoolId ?? body.school_id ?? "").trim();
    const firstName = String(body.firstName ?? body.first_name ?? "").trim();
    const lastName = String(body.lastName ?? body.last_name ?? "").trim();
    const role = (body.role ?? "school_admin") as string;

    if (!email || !schoolId || !firstName || !lastName) {
      return new Response(
        JSON.stringify({
          error: "email, schoolId, firstName et lastName sont requis",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!["school_admin", "teacher", "parent"].includes(role)) {
      return new Response(JSON.stringify({ error: "Rôle non autorisé pour invitation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviteToken = token();
    const inviteUrl = `${inviteSite.replace(/\/$/, "")}/invitation?token=${inviteToken}`;

    // invalidate previous pending invites for same email+school+role
    await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("email", email)
      .eq("school_id", schoolId)
      .eq("role", role)
      .is("accepted_at", null);

    const { data: invitation, error: invErr } = await admin
      .from("invitations")
      .insert({
        email,
        token: inviteToken,
        role,
        school_id: schoolId,
        first_name: firstName,
        last_name: lastName,
        invited_by: user.id,
      })
      .select("*")
      .single();

    if (invErr || !invitation) {
      return new Response(
        JSON.stringify({ error: invErr?.message ?? "Création invitation échouée" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Try Supabase invite email (works if Auth email is enabled)
    let emailSent = false;
    let emailError: string | null = null;
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
      data: {
        first_name: firstName,
        last_name: lastName,
        invitation_token: inviteToken,
        school_id: schoolId,
        role,
      },
    });
    if (inviteErr) {
      emailError = inviteErr.message;
    } else {
      emailSent = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitationId: invitation.id,
        inviteUrl,
        emailSent,
        emailError,
        message: emailSent
          ? "Invitation envoyée par e-mail."
          : "E-mail non envoyé (config Auth). Partagez le lien manuellement.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
