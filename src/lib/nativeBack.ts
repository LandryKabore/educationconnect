/**
 * Android back button support.
 *
 * Overlays (drawer, dialogs…) register a handler with `useNativeBack`; the most
 * recently opened one is closed first. When none is registered the native
 * shell falls back to history navigation (see NativeAppEffects).
 */
import { useEffect, useRef } from "react";

const stack: Array<() => void> = [];

/** Calls the top-most overlay handler. Returns true when something handled it. */
export function dispatchNativeBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** While `active`, the Android back button runs `handler` instead of leaving the page. */
export function useNativeBack(handler: () => void, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
