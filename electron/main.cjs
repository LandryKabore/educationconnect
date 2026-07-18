const { app, BrowserWindow, shell, session } = require("electron");
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
    backgroundColor: "#0f766e",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
    // Avoid opening 3 DevTools when multi-instancing
    if (!instance || process.env.EDUFASO_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
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
