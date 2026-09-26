import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shells (iOS / Android) around the same Vite build.
 *
 * - The app id below is the single source of truth for the iOS bundle id and the Android
 *   application id (both native projects were generated from it with `cap add`).
 * - appName must match APP_NAME in src/config/app.ts.
 * - No `server.url`: both apps bundle the local production build from `dist/` – they are
 *   not remote webviews of the Vercel site.
 */
const config: CapacitorConfig = {
  appId: 'is.bordtennis.live',
  appName: 'Borðtennis Live',
  webDir: 'dist',
  // Light UI: white behind the webview so there is no dark flash while it loads.
  backgroundColor: '#ffffff',
  server: {
    // Android serves the app from https://localhost (Capacitor's default, stated explicitly so
    // it never changes silently: a different origin would lose the stored session, player
    // choice and unsynced scores on update).
    androidScheme: 'https',
  },
  plugins: {
    // Built into Capacitor 8 core: edge-to-edge insets on Android follow the page's
    // `viewport-fit=cover`, so the existing env(safe-area-inset-*) CSS applies on both platforms.
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
};

export default config;
