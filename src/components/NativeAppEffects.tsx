import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";
import { dispatchNativeBack } from "@/lib/nativeBack";
import { isNativeApp } from "@/lib/platform";

/** Pages where the back button leaves the app instead of going back. */
const ROOT_PATHS = new Set(["/", "/connexion", "/tableau-de-bord"]);

/**
 * Native-only behavior of the Android app (no-op on web, PWA and Electron):
 * - status bar look,
 * - hardware / gesture back button: close overlays → history back → exit on root,
 * - `native-app` class on <html> (CSS hooks: page transition, no rubber-band, tap highlight).
 */
export function NativeAppEffects() {
  const native = isNativeApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { homePath, session, loading } = useAuth();

  // Keep the latest values readable from the (registered once) native listener.
  const state = useRef({ pathname: location.pathname, homePath, session, loading });
  state.current = { pathname: location.pathname, homePath, session, loading };

  useEffect(() => {
    if (!native) return;
    document.documentElement.classList.add("native-app");
    return () => document.documentElement.classList.remove("native-app");
  }, [native]);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let remove: (() => void) | undefined;

    void (async () => {
      try {
        const [{ App }, { StatusBar, Style }] = await Promise.all([
          import("@capacitor/app"),
          import("@capacitor/status-bar"),
        ]);
        if (cancelled) return;

        // Brand teal status bar with light icons (see capacitor.config.ts).
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
          await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        }

        const handle = await App.addListener("backButton", () => {
          // 1. an open drawer / dialog takes the back press first
          if (dispatchNativeBack()) return;
          const openDialog = document.querySelector('[aria-modal="true"]');
          if (openDialog) {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            return;
          }

          const { pathname, homePath: home } = state.current;
          const atRoot = ROOT_PATHS.has(pathname) || pathname === home;
          const historyIndex =
            (window.history.state as { idx?: number } | null)?.idx ?? 0;

          // 2. normal navigation: go back one page
          if (!atRoot && historyIndex > 0) {
            navigate(-1);
            return;
          }
          // 3. deep page with no history (opened from a link): go home
          if (!atRoot) {
            navigate(state.current.session ? home : "/connexion", { replace: true });
            return;
          }
          // 4. home / login: leave the app
          void App.exitApp();
        });
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      } catch {
        // Plugins unavailable (should not happen in the native shell): ignore.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [native, navigate]);

  return null;
}
