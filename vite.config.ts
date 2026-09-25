import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME, APP_SHORT_NAME, THEME_COLOR } from './src/config/app.ts';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The app shows its own "new version" prompt: never reload under a scorer's fingers.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: 'Leikskýrslur, staða og úrslit í borðtennisdeildinni.',
        lang: 'is',
        start_url: '/scorecard',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the static app shell is precached. Supabase API/auth/realtime traffic is
        // never cached: there are deliberately no runtimeCaching rules.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'seed/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
  },
});
