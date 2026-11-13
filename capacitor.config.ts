import type { CapacitorConfig } from "@capacitor/cli";

// iOS shipping path is the native SwiftUI app in `EduFaso IOS/`.
// Keep Capacitor for Android (and optional webview experiments); prefer native on iPhone.
const config: CapacitorConfig = {
  appId: "bf.edufaso.app",
  appName: "EduFaso",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0f766e",
    },
  },
};

export default config;
