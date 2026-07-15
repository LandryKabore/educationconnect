const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("edufasoDesktop", {
  platform: process.platform,
});
