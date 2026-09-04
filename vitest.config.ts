import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vite.config.ts on purpose: tests must never depend on the
// PWA/Tailwind build plugins, and keeping this minimal keeps `npm test`
// fast in CI.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
