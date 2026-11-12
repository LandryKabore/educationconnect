import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";

const THRESHOLD = 72;
const MAX_PULL = 110;

/** True when the touch started inside an element that can still scroll up. */
function insideScrolledContainer(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const scrollable = /(auto|scroll)/.test(style.overflowY);
    if (scrollable && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Pull-down-to-refresh (iOS `.refreshable` parity), only when `enabled`.
 * Never calls preventDefault, so normal scrolling is untouched.
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  enabled: boolean,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      if (window.scrollY > 0 || insideScrolledContainer(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      const value = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = value;
      setPull(value);
    };
    const onEnd = () => {
      const reached = pullRef.current >= THRESHOLD;
      reset();
      if (!reached || busy.current) return;
      busy.current = true;
      setRefreshing(true);
      void Promise.resolve(cb.current())
        .catch(() => {})
        .finally(() => {
          window.setTimeout(() => {
            busy.current = false;
            setRefreshing(false);
          }, 600);
        });
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [enabled]);

  const indicator =
    enabled && (pull > 8 || refreshing) ? (
      <div
        className="pointer-events-none fixed inset-x-0 z-[65] flex justify-center"
        style={{ top: "calc(env(safe-area-inset-top) + 56px)" }}
        role="status"
        aria-live="polite"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-brand-700 shadow-md dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-brand-300"
          style={{ transform: `translateY(${refreshing ? 8 : Math.min(pull, MAX_PULL) - 24}px)` }}
        >
          {refreshing ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Actualisation…" />
          ) : (
            <ArrowDown
              className="h-5 w-5 transition-transform"
              style={{ transform: `rotate(${pull >= THRESHOLD ? 180 : 0}deg)` }}
              aria-label={pull >= THRESHOLD ? "Relâchez pour actualiser" : "Tirez pour actualiser"}
            />
          )}
        </div>
      </div>
    ) : null;

  return { indicator, refreshing };
}
