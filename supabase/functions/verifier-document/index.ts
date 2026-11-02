// Public endpoint behind the QR code printed on bulletins: "is this paper genuine?".
// verify_jwt = false (anyone with the paper can use it). It only calls ef_verify_document, which
// is executable by service_role alone and returns: status, document type, period, school name/city,
// the holder's initials and the issue date. No grades, no full name, no ids.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Best-effort limit per IP (kept in memory: it resets when the function restarts and is not shared
// between instances). The real protection is the size of the code space (32^10).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { n: number; start: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { n: 1, start: now });
    return false;
  }
  h.n += 1;
  return h.n > MAX_PER_WINDOW;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (limited(ip)) return json({ error: "Trop de tentatives. Réessayez dans une minute." }, 429);

  let code = "";
  let average: number | null = null;
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code.slice(0, 40) : "";
    if (body?.average !== undefined && body.average !== null && body.average !== "") {
      const n = Number(String(body.average).replace(",", "."));
      if (Number.isFinite(n) && n >= 0 && n <= 20) average = n;
    }
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  if (!code) return json({ status: "unknown" });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.rpc("ef_verify_document", {
      p_code: code,
      p_check: average,
    });
    if (error) return json({ error: "Vérification indisponible. Réessayez plus tard." }, 503);
    return json(data);
  } catch {
    return json({ error: "Vérification indisponible. Réessayez plus tard." }, 503);
  }
});
