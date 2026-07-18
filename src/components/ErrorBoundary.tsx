import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Optional scope label for logs (e.g. "page", "root"). */
  scope?: string;
  /** When these change, clear the error (e.g. route pathname). */
  resetKeys?: unknown[];
  /** Compact layout for in-shell page errors. */
  compact?: boolean;
};

type State = {
  error: Error | null;
};

function keysChanged(prev: unknown[] | undefined, next: unknown[] | undefined) {
  if (prev === next) return false;
  if (!prev || !next) return Boolean(prev || next);
  if (prev.length !== next.length) return true;
  return prev.some((v, i) => !Object.is(v, next[i]));
}

/**
 * Catches render crashes so the window does not go blank.
 * Root: full-screen recovery. Compact: keep shell chrome visible.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const scope = this.props.scope ?? "app";
    console.error(`[EduFaso:${scope}] render crash`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.state.error &&
      keysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.setState({ error: null });
    }
  }

  private recover = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  private goHome = () => {
    this.setState({ error: null });
    const isHash =
      window.location.protocol === "file:" ||
      Boolean(
        (window as Window & { edufasoDesktop?: unknown }).edufasoDesktop,
      );
    window.location.href = isHash
      ? `${window.location.pathname}${window.location.search}#/tableau-de-bord`
      : "/tableau-de-bord";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message =
      error.message?.trim() || "Une erreur inattendue s’est produite.";
    const compact = this.props.compact;

    return (
      <div
        role="alert"
        className={
          compact
            ? "rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/40 dark:bg-amber-950/40"
            : "flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-[var(--bg,#1a2030)]"
        }
      >
        <div
          className={
            compact
              ? "max-w-lg"
              : "w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-[var(--surface,#243044)]"
          }
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Oups — l’écran a planté
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            L’application a rencontré une erreur. Vous pouvez réessayer sans
            perdre votre session dans la plupart des cas.
          </p>
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {message}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.recover}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Recharger la page
            </button>
            {!compact ? (
              <button
                type="button"
                onClick={this.goHome}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-transparent px-4 text-sm font-medium text-brand-700 hover:underline"
              >
                <Home className="h-4 w-4" />
                Tableau de bord
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
