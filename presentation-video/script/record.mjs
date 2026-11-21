/**
 * Records real clips of the running app for the video.
 *
 *   node script/record.mjs <eleve|parent|prof|admin|public> [shotId]
 *
 * A Chromium window opens on the login page. The PERSON signs in (this script never types a
 * password). Once signed in, it plays each shot: opens the page, moves a visible cursor, hovers,
 * scrolls, clicks only on tabs / filters / switches (never on save or submit buttons), and saves one
 * WebM per shot in public/clips, plus a still in public/stills.
 * The login is kept in .profiles/<portal>, so the next run starts signed in.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.APP_URL ?? "http://localhost:5181";
const W = 1600;
const H = 1000;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const portal = process.argv[2];
const only = process.argv[3];

/* ------------------------------------------------------------------ shot list */

const SHOTS = {
  public: [
    { id: "connexion", url: "/connexion", steps: [["wait", 800], ["hoverSel", "#identifiant"], ["clickSel", "#identifiant"], ["type", "fatoumata.nikiema"], ["wait", 500], ["hoverSel", "#password"], ["wait", 600], ["hoverText", "Se connecter"], ["wait", 1500]] },
    { id: "telecharger", url: "/telecharger", steps: [["wait", 800], ["hoverText", "Ordinateur"], ["hoverText", "Télécharger sur le site"], ["hoverText", "Android"], ["hoverText", "iPhone et iPad"], ["scroll", 500], ["hoverText", "Continuer dans le navigateur"], ["wait", 1200]] },
  ],
  admin: [
    { id: "admin-accueil", url: "/ecole", steps: [["wait", 1200], ["hoverText", "Classes"], ["hoverText", "Élèves"], ["hoverText", "Enseignants"], ["hoverText", "À traiter"], ["wait", 800], ["scroll", 600], ["wait", 800], ["scroll", 600], ["wait", 1200]] },
    { id: "admin-periodes", url: "/periodes", steps: [["wait", 1200], ["hoverText", "Trimestre 1"], ["hoverText", "Trimestre 2"], ["hoverText", "Trimestre 3"], ["scroll", 500], ["wait", 1200]] },
    { id: "admin-classes", url: "/classes", steps: [["wait", 1200], ["scroll", 400], ["wait", 800], ["scroll", 400], ["wait", 1200]] },
    { id: "admin-programmes", url: "/programmes", steps: [["wait", 1400], ["scroll", 450], ["wait", 900], ["scroll", 450], ["wait", 1200]] },
    { id: "admin-eleves", url: "/eleves", steps: [["wait", 1400], ["scroll", 500], ["wait", 600], ["scrollTop"], ["key", "Control+k"], ["wait", 700], ["type", "Nikiéma"], ["wait", 3800], ["key", "Escape"], ["wait", 600]] },
    { id: "admin-eleve-fiche", url: "/eleves", steps: [["wait", 1200], ["openFirstLink", "a[href^='/eleves/']"], ["wait", 2000], ["scroll", 500], ["wait", 900], ["scroll", 500], ["wait", 1200]] },
    { id: "admin-edt", url: "/emplois-du-temps", steps: [["wait", 1500], ["selectLabel", "6ème A"], ["wait", 2500], ["scroll", 350], ["wait", 1800]] },
    { id: "admin-examens", url: "/devoirs-ecole", steps: [["wait", 1500], ["scroll", 450], ["wait", 1500]] },
    { id: "admin-compositions", url: "/compositions-ecole", steps: [["wait", 1500], ["scroll", 400], ["wait", 1500]] },
    { id: "admin-presences", url: "/presences-ecole", steps: [["wait", 1500], ["scroll", 400], ["wait", 1500]] },
    { id: "admin-bulletins", url: "/bulletins", steps: [["wait", 1500], ["scroll", 400], ["wait", 1500]] },
    { id: "admin-annonces", url: "/annonces", steps: [["wait", 1800], ["scroll", 400], ["wait", 1500]] },
    { id: "admin-statistiques", url: "/statistiques", steps: [["waitGone", "Chargement"], ["wait", 1500], ["scroll", 500], ["wait", 900], ["scroll", 500], ["wait", 1200]] },
  ],
  prof: [
    { id: "prof-accueil", url: "/tableau-de-bord", steps: [["wait", 1500], ["hoverText", "Appels du jour"], ["hoverText", "Classes"], ["wait", 600], ["scroll", 550], ["wait", 900], ["scroll", 550], ["wait", 1200]] },
    { id: "prof-presences", url: "/presences", steps: [["wait", 1500], ["scroll", 300], ["wait", 1500]] },
    { id: "prof-appel", url: "/presences", steps: [["wait", 1200], ["openFirstLink", "a[href*='/presences'][href^='/classes/']"], ["wait", 1800], ["scroll", 400], ["wait", 900], ["scroll", 400], ["wait", 1200]] },
    { id: "prof-cahier", url: "/cahier-de-textes", steps: [["wait", 1500], ["scroll", 400], ["wait", 1500]] },
    { id: "prof-classes", url: "/mes-classes", steps: [["wait", 1500], ["scroll", 300], ["wait", 1200]] },
    { id: "prof-notes", url: "/mes-classes", steps: [["wait", 1200], ["openFirstLink", "a[href^='/classes/'][href$='/notes']"], ["wait", 1800], ["scroll", 400], ["wait", 1500]] },
    { id: "prof-devoirs", url: "/devoirs", steps: [["wait", 1500], ["scroll", 400], ["wait", 1500]] },
    { id: "prof-edt", url: "/mon-emploi-du-temps", steps: [["wait", 2000], ["scroll", 300], ["wait", 1500]] },
    { id: "prof-messages", url: "/messages", steps: [["wait", 1800], ["wait", 1500]] },
  ],
  eleve: [
    { id: "eleve-accueil", url: "/tableau-de-bord", steps: [["wait", 1500], ["hoverText", "Moyenne"], ["hoverText", "Présence"], ["hoverText", "À préparer"], ["wait", 500], ["scroll", 550], ["wait", 1000], ["scroll", 550], ["wait", 1200]] },
    { id: "eleve-notes", url: "/mes-notes", steps: [["wait", 1500], ["hoverText", "Moyenne annuelle"], ["wait", 500], ["scroll", 500], ["wait", 900], ["scroll", 500], ["wait", 1200]] },
    { id: "eleve-exercices", url: "/mes-exercices", steps: [["wait", 1500], ["scroll", 450], ["wait", 1500]] },
    { id: "eleve-examens", url: "/mes-examens", steps: [["wait", 1500], ["scroll", 450], ["wait", 1500]] },
    { id: "eleve-compositions", url: "/mes-compositions", steps: [["wait", 1500], ["scroll", 450], ["wait", 1500]] },
    { id: "eleve-presences", url: "/mes-presences", steps: [["wait", 1500], ["clickText", "Année"], ["wait", 1200], ["scroll", 500], ["wait", 1500]] },
    { id: "eleve-edt", url: "/mon-emploi-du-temps", steps: [["wait", 2000], ["scroll", 250], ["wait", 2000]] },
    { id: "eleve-bulletin", url: "/mon-bulletin", steps: [["wait", 1800], ["clickText", "Trimestre 2"], ["wait", 1500], ["scroll", 500], ["wait", 1500]] },
    { id: "eleve-messages", url: "/messages", steps: [["wait", 1500], ["clickText", "Écrire"], ["wait", 1500], ["clickText", "Annuler"], ["wait", 800]] },
    { id: "eleve-annonces", url: "/annonces", steps: [["wait", 2000], ["wait", 1200]] },
    { id: "eleve-profil", url: "/profil", steps: [["wait", 1500], ["hoverText", "Profil complété"], ["scroll", 400], ["wait", 1500]] },
  ],
  parent: [
    { id: "parent-accueil", url: "/tableau-de-bord", steps: [["wait", 1500], ["hoverText", "Vos enfants"], ["clickTextPrefix", "Voir le suivi de"], ["wait", 2000], ["clickTextPrefix", "Voir le suivi de"], ["wait", 1500], ["scroll", 600], ["wait", 1200]] },
    { id: "parent-notes", url: "/tableau-de-bord", steps: [["wait", 1200], ["openFirstLink", "a[href^='/enfants/'][href$='/notes']"], ["wait", 1800], ["scroll", 450], ["wait", 1500]] },
    { id: "parent-presences", url: "/tableau-de-bord", steps: [["wait", 1200], ["openFirstLink", "a[href^='/enfants/'][href$='/presences']"], ["wait", 1800], ["scroll", 450], ["wait", 1500]] },
    { id: "parent-bulletin", url: "/tableau-de-bord", steps: [["wait", 1200], ["openFirstLink", "a[href^='/enfants/'][href$='/bulletin']"], ["wait", 2000], ["scroll", 450], ["wait", 1500]] },
    { id: "parent-cahier", url: "/tableau-de-bord", steps: [["wait", 1200], ["gotoChild", "cahier"], ["wait", 1800], ["scroll", 400], ["wait", 1500]] },
    { id: "parent-examens", url: "/tableau-de-bord", steps: [["wait", 1200], ["gotoChild", "devoirs"], ["wait", 1800], ["scroll", 400], ["wait", 1500]] },
    { id: "parent-compositions", url: "/tableau-de-bord", steps: [["wait", 1200], ["gotoChild", "compositions"], ["wait", 1800], ["scroll", 400], ["wait", 1500]] },
    { id: "parent-messages", url: "/messages", steps: [["wait", 1500], ["clickText", "Écrire"], ["wait", 1500], ["clickText", "Annuler"], ["wait", 800]] },
    { id: "parent-annonces", url: "/annonces", steps: [["wait", 2000], ["wait", 1200]] },
  ],
};

/* ------------------------------------------------------------------ visible cursor */

const CURSOR = `
(() => {
  if (window.__cursor) return;
  window.__cursor = true;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l7 19 2.6-7.4L21 11z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed',left:'0',top:'0',zIndex:2147483647,pointerEvents:'none',transform:'translate(-200px,-200px)',transition:'transform 0s',filter:'drop-shadow(0 2px 3px rgba(0,0,0,.35))'});
    document.documentElement.appendChild(c);
    document.addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX-4) + 'px,' + (e.clientY-3) + 'px)'; }, true);
    document.addEventListener('mousedown', e => {
      const r = document.createElement('div');
      Object.assign(r.style, {position:'fixed',left:(e.clientX-18)+'px',top:(e.clientY-18)+'px',width:'36px',height:'36px',borderRadius:'50%',background:'rgba(15,118,110,.35)',zIndex:2147483646,pointerEvents:'none',transition:'transform .45s ease-out, opacity .45s ease-out'});
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(2.2)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
`;

/* ------------------------------------------------------------------ helpers */

let mouse = { x: W / 2, y: H / 2 };
/** set when a shot navigates to its real page: the clip starts there */
let navigatedAt = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function moveTo(page, x, y) {
  const dist = Math.hypot(x - mouse.x, y - mouse.y);
  await page.mouse.move(x, y, { steps: Math.max(12, Math.round(dist / 18)) });
  mouse = { x, y };
}

async function moveToLocator(page, loc) {
  await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error("no box");
  await moveTo(page, box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
}

async function smoothScroll(page, dy) {
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(16);
  }
}

async function run(page, steps) {
  for (const [op, arg] of steps) {
    try {
      if (op === "wait") await sleep(arg);
      else if (op === "hoverText") {
        await moveToLocator(page, page.getByText(arg, { exact: true }).first());
        await sleep(650);
      } else if (op === "hoverSel") {
        await moveToLocator(page, page.locator(arg).first());
        await sleep(500);
      } else if (op === "clickSel") {
        await page.locator(arg).first().click();
      } else if (op === "clickText") {
        const loc = page.getByRole("button", { name: arg, exact: true }).first();
        await moveToLocator(page, loc);
        await sleep(250);
        await loc.click();
      } else if (op === "clickTextPrefix") {
        const loc = page.getByRole("button", { name: new RegExp("^" + arg) }).first();
        await moveToLocator(page, loc);
        await sleep(250);
        await loc.click();
      } else if (op === "openFirstLink") {
        const loc = page.locator(arg).first();
        await moveToLocator(page, loc);
        await sleep(300);
        await loc.click();
        await page.waitForLoadState("networkidle").catch(() => {});
        await sleep(500);
        navigatedAt = Date.now();
      } else if (op === "gotoChild") {
        const href = await page.locator("a[href^='/enfants/']").first().getAttribute("href");
        const id = href?.split("/")[2];
        if (id) {
          await page.goto(`${BASE}/enfants/${id}/${arg}`);
          await page.waitForLoadState("networkidle").catch(() => {});
          await sleep(500);
          navigatedAt = Date.now();
        }
      } else if (op === "selectLabel") {
        const sel = page.locator("select", { has: page.locator("option", { hasText: arg }) }).first();
        await moveToLocator(page, sel);
        await sleep(300);
        await sel.selectOption({ label: arg });
      } else if (op === "waitGone") {
        await page.getByText(arg).first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
      } else if (op === "type") await page.keyboard.type(arg, { delay: 85 });
      else if (op === "key") await page.keyboard.press(arg);
      else if (op === "scroll") await smoothScroll(page, arg);
      else if (op === "scrollTop") await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      console.log(`   (skip ${op} ${arg ?? ""}: ${String(err.message).split("\n")[0]})`);
    }
  }
}

/* ------------------------------------------------------------------ main */

if (!SHOTS[portal]) {
  console.log("usage: node script/record.mjs <eleve|parent|prof|admin|public> [shotId]");
  process.exit(1);
}

const tmpDir = path.join(ROOT, ".tmp", portal);
const clipsDir = path.join(ROOT, "public", "clips");
const stillsDir = path.join(ROOT, "public", "stills");
for (const d of [tmpDir, clipsDir, stillsDir]) fs.mkdirSync(d, { recursive: true });

const isPublic = portal === "public";
const profileDir = path.join(ROOT, ".profiles", portal);

// 1) sign-in, in a visible window, only when the saved profile is not signed in yet
if (!isPublic) {
  const probe = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: W, height: H } });
  const p = await probe.newPage();
  await p.goto(`${BASE}/tableau-de-bord`);
  await sleep(3000);
  const signedIn = !p.url().includes("/connexion");
  await probe.close();
  if (!signedIn) {
    const visible = await chromium.launchPersistentContext(profileDir, { headless: false, viewport: { width: 1280, height: 800 }, locale: "fr-FR" });
    const login = visible.pages()[0] ?? (await visible.newPage());
    await login.goto(`${BASE}/connexion`);
    console.log(`\n>>> Connectez-vous avec le compte « ${portal} » dans la fenêtre Chromium (j'attends jusqu'à 30 min)…\n`);
    // signed in = a Supabase session is stored (the "save this login?" prompt keeps the URL on /connexion)
    await login.waitForFunction(
      () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
      undefined,
      { timeout: 1_800_000, polling: 1000 },
    );
    await sleep(4000);
    console.log("Connecté :", login.url());
    await visible.close();
  }
}

// 2) recording, headless at the exact size
const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: W, height: H },
  locale: "fr-FR",
  colorScheme: "light",
  recordVideo: { dir: tmpDir, size: { width: W, height: H } },
});
await ctx.addInitScript(CURSOR);
if (isPublic) await ctx.clearCookies();

const meta = fs.existsSync(path.join(clipsDir, "clips.json"))
  ? JSON.parse(fs.readFileSync(path.join(clipsDir, "clips.json"), "utf8"))
  : {};
for (const pg of ctx.pages()) await pg.close();

for (const shot of SHOTS[portal]) {
  if (only && shot.id !== only) continue;
  console.log("●", shot.id);
  const page = await ctx.newPage();
  const t0 = Date.now();
  navigatedAt = null;
  await page.goto(BASE + shot.url, { waitUntil: "domcontentloaded" });
  if (isPublic) {
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(600);
  const readyAt = (Date.now() - t0) / 1000;
  mouse = { x: W * 0.62, y: H * 0.55 };
  await page.mouse.move(mouse.x, mouse.y);
  await page.screenshot({ path: path.join(stillsDir, `${shot.id}.png`) });
  await run(page, shot.steps);
  const duration = (Date.now() - t0) / 1000;
  const video = page.video();
  await page.close();
  if (video) {
    const src = await video.path();
    const dest = path.join(clipsDir, `${shot.id}.webm`);
    fs.renameSync(src, dest);
    const start = navigatedAt ? (navigatedAt - t0) / 1000 : readyAt;
    meta[shot.id] = { start: Number(start.toFixed(2)), duration: Number(duration.toFixed(2)) };
    fs.writeFileSync(path.join(clipsDir, "clips.json"), JSON.stringify(meta, null, 2));
    console.log(`   saved ${dest} (prêt à ${readyAt.toFixed(1)} s, ${duration.toFixed(1)} s)`);
  }
}

await ctx.close();
console.log("Terminé.");
