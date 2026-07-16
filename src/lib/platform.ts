/** True when running inside the packaged Electron desktop app. */
export function isDesktopApp() {
  if (typeof window === "undefined") return false;
  if (window.location.protocol === "file:") return true;
  return Boolean(
    (window as Window & { edufasoDesktop?: unknown }).edufasoDesktop,
  );
}
