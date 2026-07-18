import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppToaster } from "@/components/AppToaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "@/App";
import "@/i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Catch async crashes that would otherwise leave a blank window. */
function installGlobalErrorHooks() {
  window.addEventListener("error", (event) => {
    console.error("[EduFaso] window error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[EduFaso] unhandled rejection", event.reason);
  });
}

installGlobalErrorHooks();

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    '<main style="font-family:system-ui;padding:2rem;max-width:28rem;margin:auto">' +
    "<h1>EduFaso</h1><p>Impossible de démarrer l’application (élément #root manquant).</p>" +
    '<button onclick="location.reload()">Recharger</button></main>';
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary scope="root">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="edufaso-theme"
        >
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <App />
              <AppToaster />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
