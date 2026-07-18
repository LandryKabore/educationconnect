import type { CSSProperties } from "react";
import { normalizeClassName, CLASS_CATALOG } from "@/lib/classCatalog";

/** Stable hue 0–359 from any string (class id or name). */
export function hueFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** Prefer evenly spaced hues for known catalogue classes. */
const CATALOG_HUE = new Map<string, number>();
{
  const n = CLASS_CATALOG.length;
  CLASS_CATALOG.forEach((item, i) => {
    CATALOG_HUE.set(
      normalizeClassName(item.name),
      Math.round((i * 360) / n) % 360,
    );
  });
}

/**
 * Resolve a hue for a class. Prefer catalogue name (stable across years),
 * then id, then raw name.
 */
export function classHue(opts: {
  id?: string | null;
  name?: string | null;
}): number {
  const name = opts.name?.trim();
  if (name) {
    const catalog = CATALOG_HUE.get(normalizeClassName(name));
    if (catalog != null) return catalog;
  }
  const key = opts.id?.trim() || name || "classe";
  return hueFromKey(key);
}

/** Sets `--class-h` for `[data-class-color]` rules in index.css. */
export function classColorVars(opts: {
  id?: string | null;
  name?: string | null;
}): CSSProperties {
  return {
    ["--class-h" as string]: String(classHue(opts)),
  };
}

/** Filled chip / selected row (uses data-class-color CSS). */
export const CLASS_COLOR_SURFACE = "class-color-surface";

/** Soft tinted background. */
export const CLASS_COLOR_SOFT = "class-color-soft";

/** Color dot. */
export const CLASS_COLOR_DOT = "class-color-dot";
