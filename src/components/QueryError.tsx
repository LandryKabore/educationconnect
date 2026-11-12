import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

/** Error state with a retry button (network or server error while loading a screen). */
export function QueryError({
  message = "Impossible de charger les données.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center dark:border-rose-500/40 dark:bg-rose-950/30"
    >
      <p className="text-sm font-medium text-rose-800 dark:text-rose-200">{message}</p>
      <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/80">
        Vérifiez votre connexion puis réessayez.
      </p>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" className="mt-3 min-h-11" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}
