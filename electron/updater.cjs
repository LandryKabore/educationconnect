/*
 * Desktop updates: every new version published on GitHub Releases is caught by the installed apps.
 *
 *  - Windows and Mac (the Mac app is signed with the Developer ID): electron-updater downloads it
 *    in the background, then « Redémarrer pour installer ».
 *  - If that fails (unsigned build, no network to GitHub's files…), the app says a new version is
 *    out and opens the download (.dmg / .exe).
 *
 * Checked when the app opens, then every 2 hours. Each version is offered once per session.
 */
const { app, dialog, shell, BrowserWindow } = require("electron");

const REPO = "LandryKabore/educationconnect";
const EVERY_MS = 2 * 60 * 60 * 1000;
const offered = new Set();

function compare(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function win() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

/** « • a\n• b » from the GitHub release text, short enough for a dialog. */
function notesOf(body) {
  const text = String(body || "").replace(/\r/g, "").replace(/^#+\s*/gm, "").trim();
  return text.length > 600 ? `${text.slice(0, 597)}…` : text;
}

async function latestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": "EduFaso-Desktop", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const d = await res.json();
  const ext = process.platform === "darwin" ? /\.dmg$/i : /\.exe$/i;
  const asset = (d.assets || []).find((a) => ext.test(a.name));
  return {
    version: String(d.tag_name || "").replace(/^v/, ""),
    notes: notesOf(d.body),
    url: asset ? asset.browser_download_url : d.html_url,
  };
}

/** « Nouvelle version disponible » with a download button (Mac, or when auto-update fails). */
async function offerDownload() {
  try {
    const r = await latestRelease();
    if (!r || !r.version || compare(r.version, app.getVersion()) <= 0 || offered.has(r.version)) return;
    offered.add(r.version);
    const { response } = await dialog.showMessageBox(win(), {
      type: "info",
      title: "Mise à jour d’EduFaso",
      message: `EduFaso ${r.version} est disponible`,
      detail: `Vous avez la version ${app.getVersion()}.${r.notes ? `\n\nNouveautés :\n${r.notes}` : ""}\n\nTéléchargez-la puis remplacez l’application.`,
      buttons: ["Télécharger", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void shell.openExternal(r.url);
  } catch (e) {
    console.error("[EduFaso] update check", e);
  }
}

function startAutoUpdater() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return false;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (e) => {
    console.error("[EduFaso] autoUpdater", e);
    void offerDownload();
  });
  autoUpdater.on("update-downloaded", async (info) => {
    if (offered.has(info.version)) return;
    offered.add(info.version);
    const { response } = await dialog.showMessageBox(win(), {
      type: "info",
      title: "Mise à jour d’EduFaso",
      message: `EduFaso ${info.version} est prête`,
      detail: `Vous avez la version ${app.getVersion()}.${
        typeof info.releaseNotes === "string" && info.releaseNotes ? `\n\nNouveautés :\n${notesOf(info.releaseNotes.replace(/<[^>]+>/g, ""))}` : ""
      }\n\nRedémarrez EduFaso pour l’installer (sinon elle s’installera à la prochaine fermeture).`,
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => void offerDownload());
  check();
  setInterval(check, EVERY_MS);
  return true;
}

function startUpdates() {
  if (!app.isPackaged) return; // development: nothing to update
  if ((process.platform === "win32" || process.platform === "darwin") && startAutoUpdater()) return;
  setTimeout(() => void offerDownload(), 8000); // after the window is up
  setInterval(() => void offerDownload(), EVERY_MS);
}

module.exports = { startUpdates, compare };
