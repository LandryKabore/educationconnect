declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

/** Id of this build (also in /version.json of the deployed site). */
export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

/** Version of the app (from package.json, injected at build time). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export function platformLabel(): string {
  if (typeof window === "undefined") return "inconnu";
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const capPlatform = cap?.getPlatform?.();
  if (capPlatform && capPlatform !== "web") return capPlatform; // "android"
  if (window.location.protocol === "file:" || (window as Window & { edufasoDesktop?: unknown }).edufasoDesktop) {
    return "bureau";
  }
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  return standalone ? "pwa" : "web";
}
