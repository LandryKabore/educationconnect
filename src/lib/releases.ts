import { supabase } from "@/lib/supabase";
import { APK_DOWNLOAD_URL, MAC_DOWNLOAD_URL, WINDOWS_DOWNLOAD_URL } from "@/lib/config";

/** App versions published by the super admin (table app_releases). */
export type ReleasePlatform = "ios" | "android" | "windows" | "mac" | "web";

export type LatestRelease = {
  version: string;
  title: string;
  notes: string;
  downloadUrl: string | null;
  publishedAt: string;
  minVersion: string | null;
};

export type ReleaseRow = {
  id: string;
  platform: ReleasePlatform;
  version: string;
  title: string;
  notes: string;
  download_url: string | null;
  min_version: string | null;
  notify: boolean;
  published_at: string;
};

export const PLATFORM_LABEL: Record<ReleasePlatform, string> = {
  web: "Web",
  ios: "iPhone",
  android: "Android",
  windows: "Windows",
  mac: "Mac",
};

export async function fetchLatestReleases(): Promise<Partial<Record<ReleasePlatform, LatestRelease>>> {
  const { data, error } = await supabase.rpc("ef_latest_releases");
  if (error) throw error;
  return (data ?? {}) as Partial<Record<ReleasePlatform, LatestRelease>>;
}

/** 1.10.0 > 1.9.2 ; returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** The platform this copy of the app runs on. */
export function currentReleasePlatform(): ReleasePlatform {
  if (typeof window === "undefined") return "web";
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  if (cap === "android") return "android";
  const desktop = window.location.protocol === "file:" || !!(window as Window & { edufasoDesktop?: unknown }).edufasoDesktop;
  if (desktop) return /Mac/i.test(navigator.userAgent) ? "mac" : "windows";
  return "web";
}

/** Where to download a platform's new version when the release gives no link. */
export function defaultDownloadUrl(p: ReleasePlatform): string | null {
  if (p === "android") return APK_DOWNLOAD_URL ?? null;
  if (p === "windows") return WINDOWS_DOWNLOAD_URL;
  if (p === "mac") return MAC_DOWNLOAD_URL;
  return null;
}
