# iOS release (TestFlight → App Store)

**Without a Mac:** use the cloud build in [codemagic-testflight.md](codemagic-testflight.md). Codemagic builds, signs and uploads to TestFlight. This page describes the manual path, which **requires macOS with Xcode**. The native project is in `ios/`. It uses Swift Package Manager, so no CocoaPods are needed.

## One-time setup

1. **Apple Developer Program:** a paid membership for the account or organisation that will publish the app.
2. **Bundle ID:** register `is.bordtennis.live` under *Certificates, Identifiers & Profiles → Identifiers*. It must match `appId` in `capacitor.config.ts`.
3. **App Store Connect:** under *My Apps → +*, create a new app with platform iOS, name *Borðtennis Live*, primary language Icelandic (or English), the bundle ID above, and an SKU (any unique string).
4. **Xcode signing:** open the project (`npm run ios:open`), select the **App** target, go to *Signing & Capabilities*, choose your **Team**, and keep *Automatically manage signing* on.

## Versioning

- **Marketing version** (`MARKETING_VERSION`, shown in the App Store, e.g. `1.0.0`): set it under App target → *General → Identity → Version*.
- **Build number** (`CURRENT_PROJECT_VERSION`): increase it for every upload, including for the same marketing version. It's the *Build* field.
- **Web version:** the web app's version (`APP_VERSION` in `src/config/app.ts`) is independent. Bump the marketing version when a store release has user-visible changes.

## TestFlight workflow

| # | Step | Where |
|---|---|---|
| 1 | `git pull` | any OS |
| 2 | `npm install` | any OS |
| 3 | `npm run build` | any OS (needs `.env.local` with the Supabase URL and anon key) |
| 4 | `npx cap sync ios` (or steps 3+4 together: `npm run ios:sync`) | any OS |
| 5 | `npx cap open ios` | **macOS** |
| 6 | Set the signing **Team** (first time) | **Xcode** |
| 7 | Check the bundle ID `is.bordtennis.live`, and bump the Version/Build | **Xcode** |
| 8 | Run on a simulator and a real device (see the checklist below) | **Xcode** |
| 9 | Select *Any iOS Device (arm64)*, then *Product → Archive* | **Xcode** |
| 10 | In the Organizer: *Distribute App → App Store Connect → Upload* | **Xcode** |
| 11 | Wait for processing (you'll get an email; usually 10–30 minutes) | App Store Connect |
| 12 | Under *TestFlight*, add internal testers, and external testers after Beta App Review | App Store Connect |

The web build is baked into the app when you archive. Run steps 3–4 before every archive, or the app will ship an old UI.

## Device checklist before upload

- Profile setup, then kill and relaunch the app: the same player is still selected, and there's no new anonymous user.
- Join a round with a code, enter a lota, lock the lineup.
- Airplane mode: the entry stays "Ósamstillt". Back online: it syncs.
- Lock the screen for a few minutes, then unlock: live scores update again.
- Share from Dagskrá, a team page and a player page: the shared link is the public web address.
- `/admin` login works, and "Skrá út" returns to player selection.
- Nothing is hidden under the notch/Dynamic Island or the home indicator, including dialogs and the scoring screen.

## Store listing and review

- **Icons:** the generated 1024×1024 opaque icon is in `AppIcon.appiconset`. Replace it with final artwork if you have it (see `CAPACITOR.md`).
- **Screenshots:** at least the 6.9" iPhone size, taken in the simulator or on a device. iPad screenshots are only needed if iPad stays enabled (it currently is; the target family is `1,2`).
- **Privacy policy URL:** required. Describe the data involved: an anonymous auth ID per device, the selected player (a public league register), round sessions and score entries, and organizer email/password. There's no tracking, no ads and no analytics.
- **App Privacy questionnaire:**
  - *Identifiers* (user ID, linked to the app's functionality, not used for tracking).
  - *Contact info → email* (organizers only).
  - *Other user content* (score entries).
  - There's no tracking, so no ATT prompt.
- **Review notes and demo:** explain that ordinary players pick their name from the league register and join a round with a 6-digit code from the organizer. Give reviewers a **working round code** and a **demo organizer account** (email and password) on a project that has test data.
- **Export compliance:** the app only uses standard HTTPS, so set `ITSAppUsesNonExemptEncryption = NO` in `Info.plist` (or answer the question on upload).

## ⚠️ Review before public App Store submission

- **Account deletion (Guideline 5.1.1(v)):** players are identified by a Supabase *anonymous* auth user per device, and organizers have email/password accounts. Check against Apple's current requirements whether in-app account deletion is needed, and whether "Skrá út" (which only unlinks the device) is enough for anonymous users. It probably isn't for organizer accounts. This hasn't been redesigned yet.
- **Minimum functionality (4.2):** a WebView app must feel like an app. The native share sheet, safe areas, the offline outbox and bundled assets help; there are no external links.
- **Public test data:** the current Supabase project contains public dev round codes from `seed.sql`. Use a production project for the store build (see `DEPLOYMENT.md`).
