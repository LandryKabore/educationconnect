import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    if (!token || password.length < 6) {
      return new Response(
        JSON.stringify({
          error: "token requis et mot de passe (6 caractères min.)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invitation, error } = await admin
      .from("invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error || !invitation) {
      return new Response(JSON.stringify({ error: "Invitation introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invitation.accepted_at) {
      return new Response(JSON.stringify({ error: "Invitation déjà utilisée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((invitation as { cancelled_at?: string | null }).cancelled_at) {
      return new Response(JSON.stringify({ error: "Invitation annulée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invitation expirée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = invitation.email as string;
    const firstName = invitation.first_name as string;
    const lastName = invitation.last_name as string;
    const role = invitation.role as string;
    const schoolId = invitation.school_id as string;

    // Find existing auth user (from inviteUserByEmail) or create
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let userId = listed?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    )?.id;

    if (userId) {
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          must_change_password: false,
        },
        app_metadata: { role, school_id: schoolId },
      });
      if (updErr) throw updErr;
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            must_change_password: false,
          },
          app_metadata: { role, school_id: schoolId },
        });
      if (createErr || !created.user) throw createErr ?? new Error("Création échouée");
      userId = created.user.id;
    }

    await admin.from("profils").upsert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      must_change_password: false,
      active: true,
    });

    // Upsert role (unique on user_id+role+school_id — don't insert a duplicate)
    let existingRoleQuery = admin
      .from("roles_utilisateurs")
      .select("id")
      .eq("user_id", userId)
      .eq("role", role);
    existingRoleQuery = schoolId
      ? existingRoleQuery.eq("school_id", schoolId)
      : existingRoleQuery.is("school_id", null);
    const { data: existingRole } = await existingRoleQuery.maybeSingle();

    if (existingRole?.id) {
      const { error: roleUpdErr } = await admin
        .from("roles_utilisateurs")
        .update({ active: true })
        .eq("id", existingRole.id);
      if (roleUpdErr) throw roleUpdErr;
    } else {
      const { error: roleInsErr } = await admin.from("roles_utilisateurs").insert({
        user_id: userId,
        role,
        school_id: schoolId || null,
        active: true,
      });
      if (roleInsErr) throw roleInsErr;
    }

    await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return new Response(
      JSON.stringify({
        success: true,
        email,
        message: "Compte créé. Vous pouvez ouvrir l'application EduFaso et vous connecter.",
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
