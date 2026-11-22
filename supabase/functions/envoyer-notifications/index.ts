import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Sends the push notifications that are due (table ef_push_queue) to Apple.
 * Called every minute by pg_cron (ef_push_kick) with the vault secret « push_cron_secret ».
 *
 * Secrets (supabase secrets set): APNS_KEY_ID, APNS_PRIVATE_KEY (content of the .p8 key),
 * optional APNS_TEAM_ID (default JUZV5J6AY8) and APNS_TOPIC (default bf.edufaso.app).
 */

type Row = { id: string; user_id: string; kind: string; title: string; body: string; screen: string | null; ref?: string | null; child_id?: string | null };
type Token = { token: string; user_id: string; environment: "sandbox" | "production" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// several notifications of the same kind for one person become one
const SUMMARY: Record<string, (n: number) => string> = {
  note: (n) => `${n} nouvelles notes`,
  exercice: (n) => `${n} nouveaux exercices`,
  evaluation: (n) => `${n} évaluations à venir`,
  composition: () => "Compositions à venir",
  edt: () => "Emploi du temps modifié",
  message: (n) => `${n} nouveaux messages`,
  annonce: (n) => `${n} nouvelles annonces`,
  rappel: () => "Pour demain",
  absence: (n) => `${n} absences ou retards`,
  confirmation: (n) => `${n} évaluations confirmées`,
  appel: (n) => `${n} appels non faits`,
  saisie: (n) => `${n} évaluations à noter`,
  aconfirmer: (n) => `${n} évaluations à confirmer`,
  signalement: (n) => `${n} nouveaux signalements`,
  bulletin: () => "Bulletins disponibles",
};

function group(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    // a parent with two children: one notification per child
    const k = `${r.user_id}|${r.kind}|${r.child_id ?? ""}`;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.values()].map((list) => {
    const first = list[0];
    // the items it points at (« note:… », « eval:… »): the app scrolls to them and highlights them
    const refs = [...new Set(list.map((r) => r.ref).filter((r): r is string => !!r))].slice(0, 20);
    const child = first.child_id ?? null;
    if (list.length === 1) return { user_id: first.user_id, kind: first.kind, title: first.title, body: first.body, screen: first.screen, refs, child };
    // a parent's copy keeps the child's first name: « Awa · 3 nouvelles notes »
    const prefix = child && first.title.includes(" · ") ? first.title.split(" · ")[0] + " · " : "";
    const title = SUMMARY[first.kind] ? prefix + SUMMARY[first.kind](list.length) : first.title;
    // messages: « Administration : Réunion · M. Ouédraogo : Devoir »
    const lines = list.map((r) => (r.kind === "message" ? `${r.title} : ${r.body}` : r.body));
    if (first.kind === "absence") lines.forEach((l, i) => (lines[i] = `${list[i].title.replace(prefix, "")} : ${l.replace(/^(Absente?|Absent\(e\)|En retard) /, "")}`));
    let body = lines.join(" · ");
    if (body.length > 220) body = body.slice(0, 217).trimEnd() + "…";
    return { user_id: first.user_id, kind: first.kind, title, body, screen: first.screen, refs, child };
  });
}

function b64url(data: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function apnsJwt(keyId: string, teamId: string, p8: string) {
  const der = Uint8Array.from(
    atob(p8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok } = await admin.rpc("ef_push_check_secret", { p_secret: secret });
  if (ok !== true) return json({ error: "Non autorisé" }, 401);

  const keyId = Deno.env.get("APNS_KEY_ID");
  const p8 = Deno.env.get("APNS_PRIVATE_KEY");
  const teamId = Deno.env.get("APNS_TEAM_ID") ?? "JUZV5J6AY8";
  const topic = Deno.env.get("APNS_TOPIC") ?? "bf.edufaso.app";
  // without the Apple key nothing is taken from the queue: it waits until the key is set
  if (!keyId || !p8) return json({ error: "Clé Apple (APNS_KEY_ID / APNS_PRIVATE_KEY) non configurée" }, 503);

  const { data: rows, error } = await admin.rpc("ef_push_claim", { p_limit: 500 });
  if (error) return json({ error: error.message }, 500);
  const due = (rows ?? []) as Row[];
  if (due.length === 0) return json({ sent: 0 });
  const { data: extraRows } = await admin.from("ef_push_queue").select("id, ref, child_id").in("id", due.map((r) => r.id));
  const extra = new Map(((extraRows ?? []) as { id: string; ref: string | null; child_id: string | null }[]).map((r) => [r.id, r]));
  for (const r of due) {
    r.ref = extra.get(r.id)?.ref ?? null;
    r.child_id = extra.get(r.id)?.child_id ?? null;
  }

  const userIds = [...new Set(due.map((r) => r.user_id))];
  const { data: tokenRows } = await admin.from("ef_push_tokens").select("token, user_id, environment").in("user_id", userIds);
  const tokens = (tokenRows ?? []) as Token[];

  const jwt = await apnsJwt(keyId, teamId, p8);
  const dead: string[] = [];
  const failed: string[] = [];
  let sent = 0;

  for (const n of group(due)) {
    const payload = JSON.stringify({
      aps: { alert: { title: n.title, body: n.body }, sound: "default", "thread-id": n.kind },
      screen: n.screen,
      kind: n.kind,
      refs: n.refs,
      // the account it is for: on a phone signed in to another account, the app says so
      for: n.user_id,
      child: n.child,
    });
    for (const t of tokens.filter((t) => t.user_id === n.user_id)) {
      const host = t.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
      try {
        const res = await fetch(`https://${host}/3/device/${t.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "content-type": "application/json",
          },
          body: payload,
        });
        if (res.ok) {
          sent++;
          continue;
        }
        const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? String(res.status);
        // the phone uninstalled the app or the token belongs to another build
        if (res.status === 410 || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic" || reason === "Unregistered") {
          dead.push(t.token);
        } else {
          failed.push(`${reason}`);
        }
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (dead.length > 0) await admin.from("ef_push_tokens").delete().in("token", dead);
  if (failed.length > 0) {
    await admin.from("ef_push_queue").update({ error: failed.slice(0, 5).join(" ; ") }).in("id", due.map((r) => r.id));
  }
  return json({ sent, removedTokens: dead.length, failed: failed.length });
});
