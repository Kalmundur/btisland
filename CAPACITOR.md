# Capacitor (future iOS / Android apps)

The web app / PWA ships first. The codebase is already prepared so that it can be wrapped with [Capacitor](https://capacitorjs.com) later, without restructuring. This document explains what is in place and what the future process looks like. **Nothing native is built yet.**

## Already prepared

| Concern | Status |
|---|---|
| Config | `capacitor.config.json` (appId `is.bordtennis.live`, `webDir: dist`, `androidScheme: https`). No Capacitor packages are installed yet, so the web build is unaffected. |
| Safe areas | `viewport-fit=cover` plus `env(safe-area-inset-*)` tokens on the header, bottom nav, banners and admin drawer. |
| Window sizing | Layout uses CSS and `100dvh` only; nothing depends on fixed window sizes. The bottom nav hides when the on-screen keyboard opens (visualViewport). |
| Navigation | In-app history via React Router. Back buttons use in-app history, with a parent-page fallback for deep links (`PageHeader`). |
| Service worker | Not registered inside a native shell (`src/lib/pwa.ts` checks `Capacitor.isNativePlatform()`). The native app serves files locally. |
| Storage | All app storage goes through `src/lib/storage.ts`, and the Supabase auth session uses it too (`src/lib/supabase.ts`). Score outbox: IndexedDB (`src/offline/idbStore.ts`), available in both WebViews. |
| Sharing | `ShareButton` uses the Web Share API, with a copy-link fallback. |
| External links | None open other sites; everything stays in-app. |
| Auth | Anonymous plus email/password. No OAuth or email-link redirects, so no deep-link auth handling is needed. |

## Future process (when you decide to publish)

1. **Install Capacitor:**
   ```bash
   npm install @capacitor/core @capacitor/app @capacitor/preferences @capacitor/share
   npm install -D @capacitor/cli
   npx cap add ios        # needs macOS + Xcode
   npx cap add android    # needs Android Studio
   ```
2. **Replace the storage backend.** Switch `src/lib/storage.ts` to `@capacitor/preferences` on native: iOS may evict WebView `localStorage` under storage pressure, and the anonymous session and selected player id should survive. Supabase accepts an async storage adapter, so only that file changes.
3. **Handle the Android back button** with `@capacitor/app`'s `backButton` event: navigate back while there is in-app history, otherwise minimise the app.
4. **Use native share:** `@capacitor/share` inside `ShareButton` when `Capacitor.isNativePlatform()`.
5. **Set the share URL base.** Inside the app, `window.location` is a local origin, so add a `VITE_PUBLIC_URL` variable for links that are shared out.
6. **Icons and splash:** replace the generated placeholders in `public/icons` with real artwork, then generate native assets (e.g. `@capacitor/assets`).
7. **Build and run:**
   ```bash
   npm run build && npx cap sync
   npx cap open ios       # or: npx cap open android
   ```
8. **Supabase:** no change needed. The app talks to the same project over HTTPS, and Realtime uses WebSockets, which both WebViews support.
9. **Store listings:** Apple Developer Program and Google Play Console accounts, a privacy policy URL (the app stores a player selection and anonymous auth only), screenshots and review.

## Deliberately not done yet

- Native builds, signing, store submission.
- Push notifications.
- Native storage/share plugins (see steps 2–4 above).
