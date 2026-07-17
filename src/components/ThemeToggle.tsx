import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600",
          className,
        )}
        aria-hidden
      >
        <Sun className="h-4 w-4 opacity-0" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50",
        compact && "px-2",
        className,
      )}
      title={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
      aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact ? (
        <span className="hidden sm:inline">{isDark ? "Clair" : "Sombre"}</span>
      ) : null}
    </button>
  );
}
