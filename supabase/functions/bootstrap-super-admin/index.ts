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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existing } = await admin
      .from("roles_utilisateurs")
      .select("id")
      .eq("role", "super_admin")
      .eq("active", true)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: "Un super administrateur existe déjà" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const firstName = String(body.firstName ?? "Super").trim();
    const lastName = String(body.lastName ?? "Admin").trim();
    const password = String(body.password ?? "EduFaso2026!");
    const username = String(body.username ?? "superadmin").trim().toLowerCase();
    const email = `${username}@edufaso.local`;

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        must_change_password: true,
      },
      app_metadata: { role: "super_admin" },
    });

    if (error || !created.user) {
      return new Response(JSON.stringify({ error: error?.message ?? "Échec" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("profils").upsert({
      id: created.user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      must_change_password: true,
      active: true,
    });

    await admin.from("roles_utilisateurs").insert({
      user_id: created.user.id,
      role: "super_admin",
      school_id: null,
      active: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        username,
        password,
        message: "Connectez-vous puis changez le mot de passe",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
