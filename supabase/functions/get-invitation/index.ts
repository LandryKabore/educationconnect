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
    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ||
      (req.method === "POST" ? (await req.json()).token : null);

    if (!token) {
      return new Response(JSON.stringify({ error: "token requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin
      .from("invitations")
      .select(
        "id, email, role, school_id, first_name, last_name, expires_at, accepted_at, ecoles(name)",
      )
      .eq("token", token)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Invitation introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data.accepted_at) {
      return new Response(JSON.stringify({ error: "Invitation déjà utilisée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(data.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invitation expirée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schoolName =
      (data as { ecoles?: { name?: string } | null }).ecoles?.name ?? null;

    return new Response(
      JSON.stringify({
        email: data.email,
        role: data.role,
        firstName: data.first_name,
        lastName: data.last_name,
        schoolId: data.school_id,
        schoolName,
        expiresAt: data.expires_at,
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
