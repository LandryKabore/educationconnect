/** Dotted numeric versions such as 1.0.2. Empty means "not set". */
export const APP_VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

export type NativePlatform = "bureau" | "android";

export type PlatformRelease = {
  latest: string | null;
  downloadUrl: string | null;
};

export type AppVersionPolicy = {
  minSupportedVersion: string | null;
  bureau: PlatformRelease;
  android: PlatformRelease;
};

export type VersionDecision = {
  updateAvailable: boolean;
  belowMinimum: boolean;
  latest: string | null;
  minimum: string | null;
  downloadUrl: string | null;
};

export function isValidAppVersion(value: string): boolean {
  return APP_VERSION_PATTERN.test(value.trim());
}

/** http(s) only, so a settings value cannot become a script URL. */
export function isHttpUrl(value: string): boolean {
  const v = value.trim();
  if (v.length < 8 || v.length > 500 || /\s/.test(v)) return false;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function cleanAppVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/^v/i, "");
  return isValidAppVersion(v) ? v : null;
}

export function cleanDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return isHttpUrl(v) ? v : null;
}

/**
 * Numeric compare. Missing pieces count as 0, so 1.2 and 1.2.0 are equal.
 * Returns null when either side is not a version (the caller must fail open).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = cleanAppVersion(a);
  const pb = cleanAppVersion(b);
  if (!pa || !pb) return null;
  const as = pa.split(".").map(Number);
  const bs = pb.split(".").map(Number);
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const da = as[i] ?? 0;
    const db = bs[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/** True when next is a strictly higher version than previous. A first value counts. */
export function isVersionRaise(next: string, previous: string): boolean {
  const n = next.trim();
  if (!isValidAppVersion(n)) return false;
  const p = previous.trim();
  if (!p) return true;
  return compareVersions(n, p) === 1;
}

export function parseAppVersionPolicy(data: unknown): AppVersionPolicy | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const platform = (value: unknown): PlatformRelease => {
    if (!value || typeof value !== "object") {
      return { latest: null, downloadUrl: null };
    }
    const release = value as Record<string, unknown>;
    return {
      latest: cleanAppVersion(release.latest),
      downloadUrl: cleanDownloadUrl(release.download_url),
    };
  };
  return {
    minSupportedVersion: cleanAppVersion(row.min_supported_version),
    bureau: platform(row.bureau),
    android: platform(row.android),
  };
}

/**
 * What the running bureau or Android copy should show.
 * An unreadable installed version never blocks and never claims an update.
 */
export function decideVersionStatus(
  installed: string,
  platform: NativePlatform,
  policy: AppVersionPolicy,
): VersionDecision {
  const release = policy[platform];
  const latest = release.latest;
  const minimum = policy.minSupportedVersion;
  const cmpLatest = latest ? compareVersions(installed, latest) : null;
  const cmpMin = minimum ? compareVersions(installed, minimum) : null;
  return {
    updateAvailable: cmpLatest !== null && cmpLatest < 0,
    belowMinimum: cmpMin !== null && cmpMin < 0,
    latest,
    minimum,
    downloadUrl: release.downloadUrl,
  };
}
