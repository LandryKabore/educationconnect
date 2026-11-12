import { Capacitor } from "@capacitor/core";

/** True when running inside the packaged Electron desktop app. */
export function isDesktopApp() {
  if (typeof window === "undefined") return false;
  if (window.location.protocol === "file:") return true;
  return Boolean(
    (window as Window & { edufasoDesktop?: unknown }).edufasoDesktop,
  );
}

/**
 * True when running inside the Capacitor native shell (Android app).
 * False on the web, in the PWA and in Electron. Use it to gate native-only behavior.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

/** Installing / downloading the app makes no sense inside the app itself. */
export function canShowInstallLinks(): boolean {
  return !isDesktopApp() && !isNativeApp();
}
