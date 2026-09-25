# Deployment

The web app / PWA is the first production target. It is a static Vite build hosted on **Vercel**, backed by **Supabase** (Postgres, Auth, Realtime).

No production URL is hardcoded anywhere: the app only needs two public environment variables, and Supabase redirect settings are configured in the Supabase dashboard.

---

## 1. Environments

Use **two separate Supabase projects**:

| | Development | Production |
|---|---|---|
| Purpose | local work, previews, QA | the real league |
| Schema | `supabase/migrations/*` | the **same** migrations |
| Data | `supabase/seed.sql`: league data **plus public dev access codes** | real data only (optionally `supabase/production/league-2026-2027.sql`) |
| Organizers | test accounts | real organizers |

Rules:

- **Migrations are the source of truth.** They are committed in `supabase/migrations/`. Never change the production schema by hand in the dashboard.
- **`supabase/seed.sql` is development-only.** It contains publicly known access codes such as `482913`. `supabase db push` never runs it; only `supabase db reset` against a local or development database does.
- **Production league data** comes from `supabase/production/league-2026-2027.sql`: the same clubs, teams, players and schedule, with **no access codes**. Run it once, manually, on an empty production database. Organizers then create real codes in the admin portal.
- **Both seed files are generated** by `npm run seed:generate` from `seed/leagueSeed.ts`.

## 2. Supabase project setup (do this for each project)

1. **Create the project** at supabase.com and pick an EU region (e.g. `eu-west`).
2. **Authentication → Sign In / Providers:**
   - **Allow anonymous sign-ins: ON.** Players sign in silently with no account.
   - **Email: ON.** Organizers use email and password.
   - Production: turn **Confirm email** on or off as you prefer. Organizers are created by hand anyway (step 5).
3. **Authentication → URL Configuration:**
   - **Site URL:** your production URL, e.g. `https://<your-app>.vercel.app` or your custom domain.
   - **Redirect URLs:** add the same URL, plus `https://*-<your-team>.vercel.app` if you use Vercel preview deployments against this project. The app itself does not use email links, so this mainly matters for password-reset emails.
4. **Apply the migrations:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push          # applies every pending file in supabase/migrations/
   ```
   `db push` records what has been applied, so running it again only applies new migrations.
5. **Load data:**
   - Development:
     ```bash
     npx supabase db reset --linked   # ⚠ wipes the linked DEVELOPMENT database, then migrations + seed.sql
     ```
   - Production (only on an empty database, once):
     ```bash
     psql "<production connection string>" -f supabase/production/league-2026-2027.sql
     ```
     Alternatively, paste the file into **SQL Editor → Run**.
6. **Create the first organizer** (see §4).
7. **Realtime:** nothing to enable. The migrations add the required tables to the `supabase_realtime` publication. Check under **Database → Publications** that `supabase_realtime` lists `encounters`, `reconciled_set_states`, `set_entries` and the others.
8. **Project Settings → API:** copy the **Project URL** and the **anon / publishable** key. **Never** copy the `service_role` key into the app or into Vercel.

## 3. Vercel deployment

1. **Push the project to GitHub:**
   ```bash
   git remote add origin git@github.com:<you>/bordtennis-live.git
   git push -u origin main
   ```
2. **Import the repository into Vercel:** vercel.com → *Add New… → Project* → pick the repository. The framework is detected as **Vite**; `vercel.json` also sets the build command (`npm run build`) and output directory (`dist`).
3. **Configure environment variables** (Project → Settings → Environment Variables):

   | Name | Production | Preview / Development |
   |---|---|---|
   | `VITE_SUPABASE_URL` | production project URL | development project URL |
   | `VITE_SUPABASE_ANON_KEY` | production anon key | development anon key |

   Only these two, and only public keys. They are compiled into the client bundle, which is expected: Row Level Security protects the data.
4. **Deploy:** push to `main` for production. Pull requests get preview deployments automatically.
5. **Configure Supabase URLs** for the new domain (§2 step 3).
6. **Verify anonymous auth:** open the site in a private window, go to **Leikskýrsla**, and pick a player.
   - In Supabase **Authentication → Users**, a new *anonymous* user appears.
   - In **Table editor → player_device_profiles**, a row links it to the player.
7. **Verify organizer login:** go to `/admin` and sign in with the organizer account.
   - The dashboard loads.
   - A non-organizer account sees *"Þessi notandi hefur ekki réttindi mótshaldara."*
8. **Verify Realtime:** open the same `/live/match/<id>` in two browsers. Score a game from a joined phone; the other browser updates without a refresh.
   - If the page shows *"Rauntímauppfærslur tafðar"*, Realtime could not connect. The page still refreshes every 15 s, but check the publication (§2 step 7).
9. **Verify PWA and routing:**
   - Reload a deep link such as `/team/<id>`. It must load, not 404; `vercel.json` rewrites every app route to `index.html`.
   - Chrome DevTools → Application → Manifest shows no errors, and the **Install** option appears.

`vercel.json` also sets:
- security headers: `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`;
- long caching for hashed `/assets/*`;
- `no-cache` for `sw.js`, `index.html` and the manifest, so new versions are picked up.

## 4. Organizer bootstrap

Organizers are ordinary Supabase Auth users with a row in `public.organizers`. That row is checked by `public.is_organizer()`, and every admin permission in RLS and the admin functions depends on it. Nothing in the frontend decides who is an organizer.

1. **Authentication → Users → Add user → Create new user.** Enter an email and a strong password, and tick *Auto confirm user*.
2. **SQL Editor** (runs as the project owner):
   ```sql
   select public.grant_organizer('organizer@example.com');
   ```
   This inserts the `organizers` row and writes an audit event. The function cannot be called from the app: `EXECUTE` is revoked from `anon` and `authenticated`.
3. **To remove access:**
   ```sql
   select public.revoke_organizer('organizer@example.com');
   ```

Organizers can then manage everything else from `/admin`.

## 5. Updating production

1. Develop and test against the **development** project. Run `npm test`; the database tests run every migration in an in-memory Postgres.
2. Commit the new migration file(s).
3. Apply them to production:
   ```bash
   npx supabase link --project-ref <production-ref>
   npx supabase db push
   ```
4. Merge to `main` → Vercel deploys the frontend.
   - Apply migrations **before** deploying frontend code that depends on them.
   - Migrations are written to be additive, so the old frontend keeps working in between.
5. Open clients get a **"Ný útgáfa er tilbúin – Uppfæra"** banner. Nothing reloads by itself, so scorers are never interrupted mid-game. Unsynced scores survive the reload because they are stored in IndexedDB.

## 6. Security checklist

- [ ] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel. No `service_role` key anywhere: `grep -ri service_role src` returns nothing.
- [ ] `.env.local` is not committed (it is in `.gitignore`).
- [ ] Anonymous sign-ins are on, and email sign-ups have the settings you intend.
- [ ] Every real round uses a code generated in the admin portal; no `is_dev_seed` codes exist in production.
- [ ] `npm test` passes. `supabase/tests/security.test.ts` covers RLS, column privileges and RPC permissions.
