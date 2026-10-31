import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function isStrongPassword(p: string) {
  return (
    p.length >= 12 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // F-17 / B-08: this endpoint is public (verify_jwt = false), so it needs a
    // one-time setup secret.  Set it with:
    //   supabase secrets set BOOTSTRAP_SECRET=<long random value>
    // and unset it again once the first super admin exists.  Without the
    // secret configured the function is disabled.
    const expectedSecret = Deno.env.get("BOOTSTRAP_SECRET") ?? "";
    if (expectedSecret.length < 16) {
      return jsonResponse(403, { error: "Fonction désactivée" });
    }
    const provided =
      req.headers.get("x-bootstrap-secret") ?? "";
    if (!safeEqual(provided, expectedSecret)) {
      return jsonResponse(403, { error: "Accès refusé" });
    }

    // Any super_admin row (active or not) closes the bootstrap, so locking the
    // only active super admin can never re-open it.
    const { data: existing } = await admin
      .from("roles_utilisateurs")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);

    if (existing && existing.length > 0) {
      return jsonResponse(400, { error: "Un super administrateur existe déjà" });
    }

    const body = await req.json().catch(() => ({}));
    const firstName = String(body.firstName ?? "Super").trim();
    const lastName = String(body.lastName ?? "Admin").trim();
    const password = String(body.password ?? "");
    if (!isStrongPassword(password)) {
      return jsonResponse(400, {
        error:
          "Mot de passe requis : 12 caractères minimum avec majuscule, minuscule, chiffre et caractère spécial.",
      });
    }
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
