# iOS builds in the cloud with Codemagic → TestFlight (no Mac needed)

This guide is for building, signing and uploading the iOS app **without owning a Mac**. Codemagic's macOS machines do all the Apple-specific work. You only use a web browser (and an iPhone to test).

```
you push to GitHub ──► Codemagic (macOS): npm ci → npm run build → npx cap sync ios
                                           → signing → signed .ipa → upload to App Store Connect
                                                                             │
                                               iPhone ◄── TestFlight ◄──────┘
```

The web app on Vercel is **not affected**. Both use the same `npm run build` output (`dist/`). Vercel serves it, and Capacitor bundles the same files into the iOS app. The app does **not** open the Vercel site.

Everything Codemagic needs is in [`codemagic.yaml`](../codemagic.yaml) at the repository root. The workflow is called **`ios-testflight`**.

## Names that must match exactly

| What | Value | Where it is used |
|---|---|---|
| Bundle ID | `is.bordtennis.live` | `capacitor.config.ts`, Xcode project, Apple Developer, App Store Connect, `codemagic.yaml` |
| App name | `Borðtennis Live` | App Store Connect |
| Codemagic App Store Connect integration | `bordtennis-appstore` | Codemagic team integrations ↔ `codemagic.yaml` |
| Codemagic environment variable group | `bordtennis-production` | Codemagic app settings ↔ `codemagic.yaml` |
| Codemagic workflow | `ios-testflight` | Codemagic "Start new build" |

## Secrets: what never goes into Git

The `.p8` key, `.p12` certificates, passwords, provisioning profiles, `.env.local`, and the Supabase **service_role** key. `.gitignore` blocks the usual file types. Put keys and passwords in Codemagic and in a password manager. The iOS app only ever gets the **public** Supabase URL and anon key.

---

## A. Apple (in the browser)

1. **Apple Developer membership.** At <https://developer.apple.com/account>, check that the membership is active (paid, renewed yearly).
2. **App ID.** *Certificates, Identifiers & Profiles → Identifiers → +*
   - Select **App IDs → App → Continue**.
   - Description: `Bordtennis Live`. Bundle ID: **Explicit**, `is.bordtennis.live`.
   - No extra capabilities are needed. **Continue → Register**.
   - If it already exists, just check the spelling.
3. **App Store Connect app record.** At <https://appstoreconnect.apple.com> → **Apps → + → New App**:
   - Platform **iOS**, Name **Borðtennis Live**, primary language Icelandic (or English).
   - Bundle ID: choose `is.bordtennis.live` from the list.
   - SKU: any unique text, e.g. `bordtennis-live-ios`. User Access: Full Access. **Create**.
4. **Numeric Apple ID of the app.** In the new app: **App Information → General Information → Apple ID**. It's a number like `6740000000`. This is **not** the bundle ID. You'll need it as `APP_STORE_APPLE_ID`.
5. **App Store Connect API key.** **Users and Access → Integrations → App Store Connect API → Team Keys**:
   - The first time, choose *Request Access* and accept.
   - Then **Generate API Key** (or **+**). Name: `Codemagic`. Access: **App Manager**. **Generate**.
6. **Issuer ID:** shown above the key list. Copy it.
7. **Key ID:** shown in the key's row. Copy it.
8. **Download the `.p8` file** (*Download API Key*). **It can only be downloaded once.** Store it in a password manager or another safe place outside the repository. If you lose it, revoke the key and make a new one.
9. **Agreements.** Under **Business** (or *Agreements, Tax, and Banking*), accept any pending agreement, in particular the Apple Developer Program License Agreement. Uploads fail while one is waiting. A free app needs no paid-apps agreement.

## B. Codemagic (in the browser)

1. **Account.** Sign up at <https://codemagic.io> with your GitHub account.
2. **Connect the repository.** **Add application → GitHub** → choose the repository → when asked for the project type, choose the option to configure with **`codemagic.yaml`**.
3. **App Store Connect integration.** **Team settings → Team integrations → Developer Portal → Connect** (or *Manage keys → Add key*):
   - **App Store Connect API key name: `bordtennis-appstore`.** This exact name is referenced by `codemagic.yaml`.
4. **Upload the `.p8` file** there.
5. **Issuer ID:** paste it.
6. **Key ID:** paste it. **Save**.
7. **Signing certificate** (Codemagic creates it, no Mac needed). **Team settings → codemagic.yaml settings → Code signing identities → iOS certificates**:
   - **Generate certificate**. Choose the `bordtennis-appstore` key and type **Apple Distribution**, and give it a reference name, e.g. `bordtennis-distribution`.
   - Codemagic stores it and shows a `.p12` download plus its password. Save **both** in your password manager (not in Git). You need them only if you ever move to another build service.
   - If you already have an Apple Distribution certificate with its `.p12`, upload that instead. Apple allows only a few distribution certificates per account.
8. **Provisioning profile.**
   - In the Apple Developer site: **Profiles → + → Distribution: App Store Connect → Continue**.
   - App ID: `is.bordtennis.live`. Certificate: the Apple Distribution certificate from step 7 (it shows today's date).
   - Name: `Bordtennis Live App Store`. **Generate**.
   - Back in Codemagic: **Code signing identities → iOS provisioning profiles → Fetch profiles**, then select that profile and save it.
   - The `ios_signing` section of `codemagic.yaml` (`distribution_type: app_store`, `bundle_identifier: is.bordtennis.live`) then picks this certificate and profile automatically.
9. **Environment variables.** Open the app in Codemagic → **Environment variables**. Add these to a group named **`bordtennis-production`** (mark the keys *Secret*):

   | Variable | Value | Notes |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | same as Vercel / `.env.local` |
   | `VITE_SUPABASE_ANON_KEY` | the **anon / public** key | **never** the service_role key |
   | `APP_STORE_APPLE_ID` | the number from A.4 | used to find the latest build number |
   | `VITE_PUBLIC_URL` (optional) | e.g. `https://btisland.vercel.app` | links shared from the app; this is the default when omitted |

10. **Check the names:** the integration is `bordtennis-appstore`, the group is `bordtennis-production`, the workflow is `ios-testflight`.
11. **Start the first build.** On the app page: **Start new build** → branch `main` → workflow **iOS – TestFlight (`ios-testflight`)** → **Start new build**. It takes roughly 10–20 minutes. The **Artifacts** tab then has the `.ipa`, the Xcode logs and debug symbols.

## C. After the build

1. Open <https://appstoreconnect.apple.com>.
2. Open **Borðtennis Live**.
3. Open **TestFlight**.
4. Wait while the build shows *Processing*. It usually takes 5–30 minutes, and Apple emails you when it's done.
   - If it then shows **Missing Compliance**, click **Manage**. The app only uses standard HTTPS encryption, so answer that it uses no non-exempt encryption.
   - This question comes back for every build. To stop it, see "Optional" below.
5. **Internal testers.** **Internal Testing → +** to create a group (e.g. `Team`) → add testers.
   - Internal testers must be users of your App Store Connect team (*Users and Access*), up to 100.
   - Add the processed build to the group if it isn't added automatically.
6. Each tester installs Apple's **TestFlight** app from the App Store on their iPhone.
7. They accept the email invitation, or open the invite link on the phone.
8. They tap **Install** on **Borðtennis Live** in TestFlight.

The first milestone is reached when the app runs from TestFlight. Nothing is sent to Beta App Review or App Store review, and nothing is released publicly: `codemagic.yaml` uploads with `submit_to_testflight: false` and `submit_to_app_store: false`.

---

## How the workflow works

| Step | What happens |
|---|---|
| Check variables | Stops early, listing the names (never the values) of any missing variable |
| `npm ci` | Installs exactly what `package-lock.json` pins |
| `npm run build` | The same production build as Vercel (typecheck + Vite) |
| `npx cap sync ios` | Copies `dist/` into `ios/App/App/public` and updates the Swift packages, then checks the copy exists |
| `xcode-project use-profiles` | Applies the certificate and profile from Codemagic to `ios/App/App.xcodeproj` |
| Build number | Asks App Store Connect for the latest uploaded build number and adds 1 (first upload: 1) |
| `xcode-project build-ipa` | Archives scheme **App** of **`ios/App/App.xcodeproj`**. The project uses Swift Package Manager, so there's no `.xcworkspace` and no CocoaPods |
| Publishing | Uploads the signed `.ipa` to App Store Connect |

**Versions.** The *build number* is set automatically on every build (latest + 1). The *version* shown to users (`MARKETING_VERSION`, now `1.0`) stays the same until you change it. Edit both `MARKETING_VERSION = 1.0;` lines in `ios/App/App.xcodeproj/project.pbxproj`, e.g. to `1.1`, and commit. Version 1.0 with builds 1, 2, 3 … is perfectly valid.

**Triggers.** The workflow has no automatic trigger. It runs only when you press *Start new build*, so pushes to `main` don't use paid macOS minutes. Later, to build automatically when you push a release tag, add this to the workflow in `codemagic.yaml`:

```yaml
    triggering:
      events:
        - tag
      tag_patterns:
        - pattern: 'ios-v*'
```

Then `git tag ios-v1.1 && git push origin ios-v1.1` starts a TestFlight build. Vercel still deploys on its own as before.

**Optional: TestFlight internal only.** Apple can mark an upload *internal testing only*, which hides it from external testers and the App Store for good. It's **not** enabled. To enable it, add this line to the *Build signed IPA* script, before `xcode-project build-ipa`:

```sh
/usr/libexec/PlistBuddy -c "Add :testFlightInternalTestingOnly bool true" "$HOME/export_options.plist"
```

**Optional: skip the export-compliance question.** Add `ITSAppUsesNonExemptEncryption` = `NO` to `ios/App/App/Info.plist`. Only do this if the app still uses nothing but standard HTTPS.

**Local development is unchanged.** `npm run dev` and `npm run build` work on Windows or Linux without Codemagic or Apple credentials.

## Troubleshooting the first builds

| Problem | Fix |
|---|---|
| Bundle identifier mismatch | `is.bordtennis.live` must be identical in `capacitor.config.ts`, the Xcode project, the App ID, the App Store Connect app, and `ios_signing` in `codemagic.yaml` |
| "No matching profiles found" | Create the **App Store Connect** distribution profile (B.8) for `is.bordtennis.live` with the certificate stored in Codemagic, then *Fetch profiles* again |
| Distribution certificate missing / private key not found | Generate or upload the Apple Distribution certificate in Codemagic (B.7). A certificate made elsewhere without its `.p12` can't be used |
| API key permission errors (upload, certificate or profile) | The key needs at least **App Manager**. If certificate generation is refused, try a key with **Admin** access |
| App record not found on upload | Create the App Store Connect app with the exact bundle ID (A.3) |
| Wrong build number / "app not found" in the build-number step | `APP_STORE_APPLE_ID` must be the numeric **Apple ID** (A.4), not the bundle ID |
| "The bundle version must be higher" / duplicate build | Usually a wrong `APP_STORE_APPLE_ID`. Check it, then start a new build |
| "Missing environment variable: VITE_…" | Add it to the `bordtennis-production` group and check the group name |
| "Capacitor copied no web build" | `npm run build` failed or `webDir` isn't `dist`. Read the *Build web app* step log |
| Project or workspace not found | The project is `ios/App/App.xcodeproj`. There's no `.xcworkspace` (Swift Package Manager) |
| Scheme "App" not found | The shared scheme `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` must be committed |
| Upload refused: agreement | Accept the pending agreement in App Store Connect (A.9) |
| Upload succeeded but nothing in TestFlight | Apple is still processing (up to ~30 min, sometimes longer); watch for the email |
