const { contextBridge, clipboard } = require("electron");

contextBridge.exposeInMainWorld("edufasoDesktop", {
  platform: process.platform,
  writeClipboardText(text) {
    clipboard.writeText(String(text ?? ""));
    return true;
  },
});
