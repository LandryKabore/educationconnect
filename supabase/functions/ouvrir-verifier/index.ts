// Public HTTPS landing for bulletin QR codes.
// Camera only opens http(s). Supabase Edge rewrites HTML responses to text/plain + CSP sandbox,
// so this function must NOT serve a page — it 302s into the native app instead.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function normalizeAverage(raw: string): number | null {
  const n = Number(String(raw || "").trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return Math.round(n * 100) / 100;
}

function redirectToApp(code: string) {
  const appUrl = `edufaso://verifier?c=${encodeURIComponent(code)}`;
  const hint =
    `EduFaso\n\nOuvrez ce lien dans l'app : ${appUrl}\n\n` +
    `Si l'app ne s'ouvre pas, lancez EduFaso → Verifier un document, puis saisissez le code ${code}.`;
  return new Response(hint, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: appUrl,
      Refresh: `0;url=${appUrl}`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let code = (url.searchParams.get("c") || "").trim().toUpperCase().slice(0, 40);
  let average: number | null = null;

  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        const body = await req.json();
        if (typeof body?.code === "string") code = body.code.trim().toUpperCase().slice(0, 40);
        if (body?.average != null) average = normalizeAverage(String(body.average));
      } else {
        const form = await req.formData();
        const c = form.get("code");
        const a = form.get("average");
        if (typeof c === "string") code = c.trim().toUpperCase().slice(0, 40);
        if (typeof a === "string") average = normalizeAverage(a);
      }
    } catch {
      return json({ error: "Requete invalide" }, 400);
    }

    if (!code || average == null) {
      return json({ error: "Indiquez le code et la moyenne imprimee (ex. 11,01)." }, 400);
    }

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
      if (error || !data) return json({ error: "Verification indisponible." }, 503);
      return json(data);
    } catch {
      return json({ error: "Verification indisponible." }, 503);
    }
  }

  if (!code) {
    return new Response(
      "EduFaso — scannez le QR d'un bulletin, ou ouvrez l'app → Verifier un document.",
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }

  // Camera / Safari: hand off to the installed app (HTML pages are stripped by the gateway).
  return redirectToApp(code);
});
