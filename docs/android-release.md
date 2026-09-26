# Android release (internal testing → Google Play)

**Requires Android Studio**, which includes the Android SDK and a JDK. It runs on Windows, macOS and Linux. The native project is in `android/`. It currently targets and compiles against **API 36**, with a minimum of API 24 (`android/variables.gradle`).

## One-time setup

1. **Google Play Console:** a developer account (one-time fee). New personal accounts must run a **closed test** (currently at least 12 testers for 14 days) before they can apply for production access.
2. **Create the app:** under *All apps → Create app*, name it *Borðtennis Live*, choose App (not game), Free, and the default language.
3. **Application ID:** `is.bordtennis.live` (`applicationId` in `android/app/build.gradle`, from `capacitor.config.ts`). It can never change after the first upload.
4. **Play App Signing:** keep it enabled (the default). Google holds the app signing key, and you sign uploads with an **upload key**.
5. **Upload keystore:** create it once and **back it up**. If you lose it, you have to request an upload-key reset.
   ```bash
   keytool -genkeypair -v -keystore bordtennis-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Keep the `.jks` file and its passwords **outside the repository**. `*.jks`, `*.keystore` and `keystore.properties` are git-ignored.

## Versioning

- **versionName** (shown to users, e.g. `1.0.0`) and **versionCode** (an integer that must increase with every upload) are both in `android/app/build.gradle` under `defaultConfig`.
- **Web version:** the web app's `APP_VERSION` is independent.

## Internal-testing workflow

| # | Step | Where |
|---|---|---|
| 1 | `npm install` | any OS |
| 2 | `npm run build` (needs `.env.local`) | any OS |
| 3 | `npx cap sync android` (or steps 2+3 together: `npm run android:sync`) | any OS |
| 4 | `npx cap open android` | Android Studio |
| 5 | Run on an emulator and a real device (see the checklist below) | Android Studio |
| 6 | Bump `versionCode` (and `versionName`) | `android/app/build.gradle` |
| 7 | *Build → Generate Signed App Bundle / APK → Android App Bundle*, choose the upload keystore, variant **release** | Android Studio |
| 8 | Upload the `.aab` (`android/app/release/app-release.aab`) | Play Console → *Testing → Internal testing → Create new release* |
| 9 | Add testers (an email list) and roll out to **internal testing** first, then closed testing, then production | Play Console |

The web build is baked into the bundle. Run steps 2–3 before every release build.

## Device checklist before upload

- **Player identity:** profile setup, then force-stop and relaunch. The same player is still selected.
- **Back button:**
  - it closes an open dialog first;
  - then it goes back through pages;
  - on the first screen it sends the app to the background, with no loop.
- **System bars:** nothing is hidden under the status bar or the gesture/navigation bar, on both gesture navigation and 3-button navigation.
- **Offline:** airplane mode makes an entry "Ósamstillt". Reconnecting syncs it, including after resuming the app.
- **Sharing:** the share sheet shares the public web address.
- **Accounts:** `/admin` login works, and "Skrá út" returns to player selection.

## Store listing

- **Icons:** a 512×512 Play icon (for the listing) and a 1024×500 feature graphic. The launcher icons in `mipmap-*` are generated (see `CAPACITOR.md`).
- **Screenshots:** at least 2 phone screenshots.
- **Privacy policy URL:** required.
- **Data safety form:**
  - *User IDs* (anonymous device ID), *Email* (organizers) and *App activity / user-generated content* (score entries).
  - All of it is collected for app functionality, encrypted in transit, and not shared or sold.
  - There's no ads SDK and no analytics.
- **Content rating questionnaire** and **target audience** (not directed at children).
- **App access:** give reviewers a working round code and a demo organizer account.

## Target API requirements

Google Play requires new apps and updates to target a recent API level; the deadline usually moves up once a year. Before each release, check the current requirement in Play Console. If a new level is required, update `targetSdkVersion`/`compileSdkVersion` in `android/variables.gradle` (a Capacitor upgrade usually brings these).

## Follow-ups

- **Account deletion:** Google Play requires an account-deletion path for apps that allow account creation. Review this for organizer accounts and anonymous device users before production.
- **Public test data:** use a production Supabase project for store builds (see `DEPLOYMENT.md`); the current dev project has public round codes.
