import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "bf.edufaso.app",
  appName: "EduFaso",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    // Android 15+ forces edge-to-edge: without this the WebView draws under the
    // status bar / navigation bar and the header buttons cannot be tapped.
    // "auto" gives the WebView margins equal to the system bars on Android 15+;
    // older versions already keep the WebView below the bars.
    adjustMarginsForEdgeToEdge: "auto",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      // Brand teal behind the status bar, light icons on top of it
      backgroundColor: "#0f766e",
      style: "DARK",
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0f766e",
    },
  },
};

export default config;
