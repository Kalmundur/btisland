# Borðtennis Live

Phone-first web app for the Icelandic table tennis league: player scorecard, public standings/results and an organizer portal.

The app name is set in one place: `src/config/app.ts` (`APP_NAME`).

**Stack:** React 19 · TypeScript · Vite · React Router · Supabase (Postgres, RLS, Realtime, Auth) · react-i18next · lucide-react · plain CSS with design tokens · Vitest.

---

## 1. Local setup

Requires Node 22.18+ (Node 24 recommended; the seed generator uses Node's built-in TypeScript support).

```bash
npm install
cp .env.example .env.local      # then fill in the two values (see below)
npm run dev                     # http://localhost:5173
```

The app builds and runs without credentials. Screens that need the database show a "Gagnagrunnur ekki tengdur" (database not connected) notice.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run typecheck` | TypeScript check (app + node configs) |
| `npm test` | Vitest unit tests (domain logic, seed integrity, translations, admin forms) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run seed:generate` | Regenerate `supabase/seed.sql` from `seed/leagueSeed.ts` |

## 2. Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same page → `anon` / publishable key |

Only the **public anon key** goes in the frontend. Never put the service-role key in any `VITE_` variable. `.env` and `.env.*` are git-ignored (except `.env.example`).

## 3. Supabase setup

### Option A: hosted project (supabase.com)

1. Create a project.
2. **Authentication → Sign In / Providers**:
   - enable **Allow anonymous sign-ins** (ordinary players sign in anonymously in the background);
   - keep **Email** enabled (organizers use email and password).
3. Apply the migrations, either with the CLI (see below) or by running the three files in `supabase/migrations/` in order in the SQL editor.
4. Seed: run `supabase/seed.sql` in the SQL editor, or run `psql "$DB_URL" -f supabase/seed.sql`.
5. Create an organizer:
   - **Authentication → Users → Add user** (email + password, auto-confirm);
   - in the SQL editor:
     ```sql
     insert into public.organizers (user_id)
     select id from auth.users where email = 'you@example.com';
     ```
6. Put the URL and anon key in `.env.local` (and in Vercel's environment variables when deploying).

### Option B: local Supabase (Docker + Supabase CLI)

```bash
npx supabase start          # starts Postgres/Auth/Realtime locally, prints URL + anon key
npx supabase db reset       # applies supabase/migrations/* and then supabase/seed.sql
```

`supabase/config.toml` already enables anonymous sign-ins locally. Then create an organizer in Studio (http://localhost:54323) as described in step 5 above.

### Running migrations against a hosted project with the CLI

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # applies pending migrations
```

## 4. Seed data

`seed/leagueSeed.ts` is the single source of truth for the 2026–2027 season, *1. deild karla*, 4 clubs, 6 teams, 37 players with team registrations, 10 rounds and 30 encounters. `seed/leagueSeed.test.ts` verifies the relationships: every team plays once per round, and every pair meets twice with each team at home once.

After editing it, run `npm run seed:generate` to rewrite `supabase/seed.sql`.

**Development access codes.** The seed gives each round a six-digit code (Umferð 1 `271828` … Umferð 4 `482913` … Umferð 10 `223606`). They are flagged `is_dev_seed` and appear with a warning in the admin portal. They are public, so **regenerate every code before a real round** (Admin → Umferðir → a round → *Nýr kóði*).

## 5. How it fits together

```
src/
  config/        app name, languages, points rule, storage keys
  domain/        pure types + logic (standings, ranking, set rules, lineups, round code, search) – unit tested
  data/          repositories: the ONLY place that talks to Supabase (+ row→domain mappers)
  state/         Auth / League / Profile React contexts
  hooks/         useAsync, useEncounterData (realtime-refreshing encounter bundle)
  components/    small UI kit: BottomNav, PageHeader, List, Button, inputs, encounter views
  features/      scorecard, standings, players, settings, live (public deep links), admin
  i18n/          is (default) + en; en is type-checked against is, and a test checks key parity
  styles/        tokens.css (all colours/spacing/radius/control sizes), base, components, admin
supabase/
  migrations/    schema → security (RLS) → RPCs
  seed.sql       generated
```

### Player identity

On first use, a player picks their own name from the official register and taps "Þetta er ég". The app stores the **player id**, both server-side (`player_device_profiles`, keyed by the anonymous auth user) and in localStorage for fast startup. Names are always read from the database. This is trust-based by design: there are no PINs or passwords.

### Round access (`join_round`)

Each round has one active six-digit code in `round_access_codes`, which the public cannot read. `join_round(code)` is a `SECURITY DEFINER` RPC that:

1. validates the code;
2. finds the caller's player and their team registration in that season and division;
3. finds the team's encounter in that round;
4. creates a `round_sessions` row.

If more than one encounter matches, it returns the choices instead of guessing. Failed attempts are rate-limited to 10 per 15 minutes per user. Regenerating a code never touches existing sessions.

### Security (enforced in Postgres, not just the UI)

- **Public read:** clubs, teams, players, seasons, divisions, schedule, results, agreed set scores, and lineups once both teams have submitted theirs.
- **Private:**
  - access codes and the audit log: organizers only;
  - raw per-side score entries: your own side only;
  - unrevealed lineups and doubles: your own team only.
- **Player writes** go only through RPCs that check the caller's round session: `submit_lineup`, `confirm_lineup`, `submit_doubles`, `confirm_doubles`, `submit_set_entry` (validates 11-point / win-by-2 sets and reconciles both sides' entries), and `confirm_result`.
- **Organizer writes** require a row in `public.organizers` (`is_organizer()`).
- **Audit:** triggers write every change on the main tables to `audit_log`.

### Realtime

`encounters`, `lineups`, `doubles_selections`, `encounter_games`, `reconciled_set_states` and `result_confirmations` are in the `supabase_realtime` publication. `subscribeToEncounter()` triggers a refetch on any change, so the database stays the single source of truth.

### Decisions worth knowing

- Standings: win 2, draw 1, loss 0 (`STANDINGS_POINTS` in `src/config/app.ts`). Order is points, then game difference, then games won. Only `completed` encounters count.
- A joined round stays active on the Scorecard until the day after the round date.
- Dates are formatted from built-in Icelandic/English month and weekday names, not `Intl`. Some Chromium builds and Android WebViews lack Icelandic locale data and silently fall back to English.
- The admin portal is a lazily loaded chunk, so players never download it.
- The `Database` generic for supabase-js is not generated yet. Row shapes live in `src/data/mappers.ts`. Once the schema settles, run `npx supabase gen types typescript` and switch to typed clients.

## 6. Deploying

- **Vercel:** framework "Vite", build `npm run build`, output `dist/`. `vercel.json` rewrites every path to `index.html` for client-side routing. Set both `VITE_` variables in the project settings.
- **Capacitor (later):** the app avoids browser-only assumptions. It respects safe areas, uses no cookies, keeps storage behind `src/lib/storage.ts`, and uses no service worker. Wrap `dist/` as usual.
