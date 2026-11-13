import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as { version: string };
const capacitor = process.env.CAPACITOR === "true";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Electron needs relative assets; GitHub Pages needs the repo base path
  base:
    process.env.ELECTRON === "true"
      ? "./"
      : process.env.GITHUB_PAGES === "true"
        ? "/educationconnect/"
        : "/",
  plugins: [
    react(),
    tailwindcss(),
    // The native shell loads the bundled files directly. A service worker fights that WebView.
    ...(capacitor ? [] : [VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.png",
        "edufaso-logo.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
      ],
      manifest: {
        name: "EduFaso",
        short_name: "EduFaso",
        description: "Système de gestion scolaire pour le Burkina Faso",
        theme_color: "#0f766e",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        lang: "fr",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    })]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
