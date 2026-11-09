declare const __APP_VERSION__: string;

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

/** Installed desktop or Android copy. Web and PWA update themselves and return null. */
export function nativePlatform(): "bureau" | "android" | null {
  const label = platformLabel();
  if (label === "bureau" || label === "android") return label;
  return null;
}
