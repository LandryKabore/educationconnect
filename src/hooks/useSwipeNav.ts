import { useEffect, useRef } from "react";

const MIN_DX = 72;
/** Horizontal move must clearly dominate the vertical one, so scrolling never triggers it. */
const RATIO = 1.6;

/** True when the touch started in something that scrolls sideways or takes drags (tables, sliders, inputs). */
function startedInHorizontalWidget(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return true;
    }
    const style = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 2) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Swipe right / left anywhere on the screen (iOS RoleShellView parity: right = menu, left = profile).
 * Passive listeners only: vertical scrolling is never blocked.
 */
export function useSwipeNav({
  enabled,
  onRight,
  onLeft,
}: {
  enabled: boolean;
  onRight?: () => void;
  onLeft?: () => void;
}) {
  const start = useRef<{ x: number; y: number; ok: boolean } | null>(null);
  const right = useRef(onRight);
  const left = useRef(onLeft);
  right.current = onRight;
  left.current = onLeft;

  useEffect(() => {
    if (!enabled) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start.current = null;
        return;
      }
      const t = e.touches[0];
      start.current = {
        x: t.clientX,
        y: t.clientY,
        ok:
          !startedInHorizontalWidget(e.target) &&
          !document.querySelector('[aria-modal="true"]'),
      };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || !s.ok) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO) return;
      if (dx > 0) right.current?.();
      else left.current?.();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [enabled]);
}
