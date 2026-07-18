const { app, BrowserWindow, shell, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;

/** Separate profiles so multiple windows can stay logged into different portals. */
const instance = String(process.env.EDUFASO_INSTANCE || "").trim();
if (instance) {
  const base = app.getPath("userData");
  const dir = path.join(path.dirname(base), `EduFaso-dev-${instance}`);
  fs.mkdirSync(dir, { recursive: true });
  app.setPath("userData", dir);
}

function appEntryUrl(win) {
  if (isDev) {
    return process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  }
  return path.join(__dirname, "..", "dist", "index.html");
}

function loadApp(win) {
  if (isDev) {
    void win.loadURL(appEntryUrl(win));
  } else {
    void win.loadFile(appEntryUrl(win));
  }
}

function createWindow() {
  const index = Number(instance) || 1;
  const offset = (index - 1) * 40;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    x: 40 + offset,
    y: 40 + offset,
    title: instance ? `EduFaso (${instance})` : "EduFaso",
    // Soft slate — avoids a harsh black flash if the renderer stalls
    backgroundColor: "#1a2030",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  loadApp(win);

  if (isDev) {
    // Avoid opening 3 DevTools when multi-instancing
    if (!instance || process.env.EDUFASO_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Renderer crash (OOM, GPU, etc.) → reload instead of a blank window
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[EduFaso] render-process-gone", details);
    const choice = dialog.showMessageBoxSync(win, {
      type: "error",
      title: "EduFaso — plantage",
      message: "L’application a planté.",
      detail:
        "Le moteur d’affichage s’est arrêté. Vous pouvez recharger pour continuer.",
      buttons: ["Recharger", "Fermer"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) loadApp(win);
    else win.close();
  });

  win.webContents.on("unresponsive", () => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      title: "EduFaso — ne répond plus",
      message: "L’application ne répond plus.",
      detail: "Voulez-vous recharger la fenêtre ?",
      buttons: ["Recharger", "Attendre"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) loadApp(win);
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    if (errorCode === -3) return; // aborted
    console.error("[EduFaso] did-fail-load", errorCode, errorDescription);
    dialog.showMessageBox(win, {
      type: "error",
      title: "EduFaso — chargement impossible",
      message: "Impossible de charger l’application.",
      detail: `${errorDescription} (${errorCode})`,
      buttons: ["Recharger"],
    }).then(({ response }) => {
      if (response === 0) loadApp(win);
    });
  });
}

app.whenReady().then(() => {
  const allowed = new Set([
    "geolocation",
    "clipboard-sanitized-write",
    "clipboard-read",
  ]);

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(allowed.has(permission));
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => allowed.has(permission),
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
