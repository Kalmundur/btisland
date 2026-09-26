# Native apps (Capacitor): iOS and Android

One codebase, three targets. The React/Vite app is the source of truth. The iOS and Android apps are thin Capacitor shells that bundle the same production build (`dist/`).

```
shared React/Vite app → npm run build → dist/ → Web (Vercel) · iOS (Xcode) · Android (Android Studio)
```

- **App ID** (iOS bundle ID and Android application ID): `is.bordtennis.live`. It's defined once, in `capacitor.config.ts`.
- **App name:** `Borðtennis Live`. It must match `APP_NAME` in `src/config/app.ts`.
- **Local bundle:** there is no `server.url`. The apps run the bundled build and are not remote webviews of the Vercel site.
- **Plugins:** `@capacitor/app` (back button, resume), `@capacitor/share`, `@capacitor/preferences`. Capacitor 8 core includes `SystemBars`, which handles the status bar and Android edge-to-edge.

## Commands

| Task | Command |
|---|---|
| Web development | `npm run dev` |
| Web production build (Vercel runs this) | `npm run build` |
| Build and copy into both native projects | `npm run native:sync` |
| iOS: build, sync, open Xcode | `npm run ios:sync` then `npm run ios:open` (macOS only) |
| Android: build, sync, open Android Studio | `npm run android:sync` then `npm run android:open` |
| Regenerate all icons (web and native) | `npm run icons:generate` then `npm run native:sync` |

Ordinary features are written once in React. A native release only needs `*:sync`, followed by a build in Xcode or Android Studio.

## What is native-specific (all centralised)

| File | Purpose |
|---|---|
| `capacitor.config.ts` | App ID/name, `webDir: dist`, Android `https` scheme, SystemBars (edge-to-edge insets follow `viewport-fit=cover`) |
| `src/lib/platform.ts` | `isNative`, `isWeb`, `isIOS`, `isAndroid` (Capacitor APIs, no user-agent sniffing) |
| `src/lib/native.ts` | Native startup: dark status-bar icons; Android back (close modal → history back → minimise); flush queued scores on resume |
| `src/lib/storage.ts` | On native, writes are mirrored to Preferences and restored before the first render, so the anonymous session, selected player and language survive iOS WebView storage eviction. Supabase session reads wait for the restore (`storageReady`). |
| `src/lib/share.ts` | Native share sheet, or Web Share / copy link on the web. Native shares use `PUBLIC_WEB_URL` (`VITE_PUBLIC_URL`, default `https://btisland.vercel.app`). |
| `src/lib/pwa.ts` | The service worker is never registered inside the native apps. |

## Behaviour notes

- **Routing:** React Router runs inside the WebView. Capacitor's local server returns `index.html` for app routes, so this doesn't depend on Vercel rewrites. Web deep links are unchanged. Universal links and app links (opening shared web links in the app) are a later improvement.
- **Safe areas:** the existing `env(safe-area-inset-*)` tokens cover the header, bottom nav, banners, dialogs, the admin bar, drawer and sheet. They're zero on the web.
- **Orientation:** portrait on iPhone and Android phones. iPad keeps all orientations, which iPad multitasking requires.
- **Offline outbox:** unchanged. It uses IndexedDB, which both WebViews support. The browser `online`/`offline` events and the retry timer are kept. On native, queued scores are also sent when the app returns to the foreground.
- **Realtime:** unchanged. Channels reconnect on `visibilitychange` and `online`, with polling while degraded.
- **External links:** the app has none, so nothing can replace the app's navigation context.
- **Organizer portal:** the same app opens `/admin`. It uses the same email/password auth and RLS.

## Icons and launch screen

`npm run icons:generate` draws everything at native size from the artwork in `scripts/generate-icons.ts` (no upscaling):

- **iOS:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024, opaque) and `Splash.imageset/*` (2732×2732).
- **Android:** `mipmap-*/ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png` (adaptive, teal background `#0F766E` in `values/ic_launcher_background.xml`), and `drawable*/splash.png`.

For final branding, either replace the artwork in the script and rerun it, or replace these files directly with the same sizes. You'll need a 1024×1024 square master with no transparency for iOS, and a foreground layer with the artwork inside the central 66/108 for Android.

## Not included (deliberately)

Push notifications, haptics (optional later: confirming a lota, locking a lineup, final confirmation), live updates / code push, analytics, and CI/CD or store automation.

## Release guides

- [docs/ios-release.md](docs/ios-release.md)
- [docs/android-release.md](docs/android-release.md)
