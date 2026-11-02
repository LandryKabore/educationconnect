import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warns before the user loses unsaved work.
 *  - in-app navigation (another page) is held by a react-router blocker:
 *    render <UnsavedChangesDialog> with the returned blocker to let the user choose;
 *  - closing / reloading the tab or the window uses the browser's `beforeunload`
 *    (Electron shows its own French dialog, see electron/main.cjs).
 * Changing only the query string (date, subject) is not a navigation away.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return blocker;
}

export const UNSAVED_ROLLCALL_MESSAGE =
  "Appel non validé — vos modifications seront perdues. Quitter quand même ?";
