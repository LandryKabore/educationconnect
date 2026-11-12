import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** « Hors ligne » strip: cached data stays visible, fresh data resumes when the network is back. */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-950 dark:bg-amber-900 dark:text-amber-50"
    >
      <WifiOff className="h-3.5 w-3.5" />
      Hors ligne — les dernières données enregistrées sont affichées.
    </div>
  );
}
