/**
 * Generates supabase/seed.sql from seed/leagueSeed.ts.
 * Run with: npm run seed:generate  (Node >= 22.18 strips TypeScript types natively)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SEED_CLUBS,
  SEED_DIVISION,
  SEED_ROUNDS,
  SEED_SEASON,
  SEED_TEAMS,
} from '../seed/leagueSeed.ts';

const q = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const lines: string[] = [];
const out = (s = '') => lines.push(s);

out('-- ============================================================================');
out('-- GENERATED FILE – do not edit by hand. Source: seed/leagueSeed.ts');
out('-- Regenerate with: npm run seed:generate');
out('-- ============================================================================');
out('begin;');
out();
out('-- Season');
out(
  `insert into public.seasons (name, starts_on, ends_on, is_current) values (${q(SEED_SEASON.name)}, ${q(SEED_SEASON.startsOn)}, ${q(SEED_SEASON.endsOn)}, true);`,
);
out();
out('-- Division');
out(
  `insert into public.divisions (season_id, name, sort_order)\nselect s.id, ${q(SEED_DIVISION.name)}, ${SEED_DIVISION.sortOrder} from public.seasons s where s.name = ${q(SEED_SEASON.name)};`,
);
out();
out('-- Clubs');
out(
  `insert into public.clubs (name, short_name) values\n${SEED_CLUBS.map((c) => `  (${q(c)}, ${q(c)})`).join(',\n')};`,
);
out();
out('-- Teams');
out(
  `insert into public.teams (club_id, name)\nselect c.id, v.name from (values\n${SEED_TEAMS.map((t) => `  (${q(t.name)}, ${q(t.club)})`).join(',\n')}\n) as v(name, club) join public.clubs c on c.short_name = v.club;`,
);
out();
out('-- Teams entered into the division');
out(
  `insert into public.division_teams (division_id, team_id)\nselect d.id, t.id from public.teams t\ncross join public.divisions d join public.seasons s on s.id = d.season_id\nwhere s.name = ${q(SEED_SEASON.name)} and d.name = ${q(SEED_DIVISION.name)}\n  and t.name in (${SEED_TEAMS.map((t) => q(t.name)).join(', ')});`,
);
out();
const playerRows = SEED_TEAMS.flatMap((t) => t.players.map((p) => `  (${q(p)}, ${q(t.name)})`));
out('-- Players (belong to the club of their team) and their team registrations');
out(`create temporary table _seed_players (full_name text, team text) on commit drop;`);
out(`insert into _seed_players (full_name, team) values\n${playerRows.join(',\n')};`);
out(
  `insert into public.players (club_id, full_name)\nselect t.club_id, sp.full_name from _seed_players sp join public.teams t on t.name = sp.team;`,
);
out(
  `insert into public.team_registrations (player_id, team_id, season_id, division_id)\nselect p.id, t.id, d.season_id, d.id\nfrom _seed_players sp\njoin public.teams t on t.name = sp.team\njoin public.players p on p.full_name = sp.full_name and p.club_id = t.club_id\ncross join public.divisions d join public.seasons s on s.id = d.season_id\nwhere s.name = ${q(SEED_SEASON.name)} and d.name = ${q(SEED_DIVISION.name)};`,
);
out();
out('-- Rounds (start time unknown -> null)');
out(
  `insert into public.rounds (division_id, number, round_date, start_time, venue)\nselect d.id, v.number, v.round_date::date, null, v.venue from (values\n${SEED_ROUNDS.map((r) => `  (${r.number}, ${q(r.date)}, ${q(r.venue)})`).join(',\n')}\n) as v(number, round_date, venue)\ncross join public.divisions d join public.seasons s on s.id = d.season_id\nwhere s.name = ${q(SEED_SEASON.name)} and d.name = ${q(SEED_DIVISION.name)};`,
);
out();
out('-- Encounters (home team = "Lið 1" = A/B/C, away team = X/Y/Z)');
const encounterRows = SEED_ROUNDS.flatMap((r) =>
  r.encounters.map(([home, away]) => `  (${r.number}, ${q(home)}, ${q(away)})`),
);
out(
  `insert into public.encounters (round_id, home_team_id, away_team_id)\nselect r.id, ht.id, at.id from (values\n${encounterRows.join(',\n')}\n) as v(round_number, home, away)\njoin public.rounds r on r.number = v.round_number\njoin public.divisions d on d.id = r.division_id and d.name = ${q(SEED_DIVISION.name)}\njoin public.seasons s on s.id = d.season_id and s.name = ${q(SEED_SEASON.name)}\njoin public.teams ht on ht.name = v.home\njoin public.teams at on at.name = v.away;`,
);
out();
out('-- ----------------------------------------------------------------------------');
out('-- DEVELOPMENT SEED ACCESS CODES – publicly known, NOT for production use.');
out('-- Regenerate every code in the admin portal (Rounds -> Regenerate) before a real round.');
out('-- ----------------------------------------------------------------------------');
out(
  `insert into public.round_access_codes (round_id, code, is_active, is_dev_seed)\nselect r.id, v.code, true, true from (values\n${SEED_ROUNDS.map((r) => `  (${r.number}, ${q(r.devAccessCode)})`).join(',\n')}\n) as v(round_number, code)\njoin public.rounds r on r.number = v.round_number\njoin public.divisions d on d.id = r.division_id and d.name = ${q(SEED_DIVISION.name)}\njoin public.seasons s on s.id = d.season_id and s.name = ${q(SEED_SEASON.name)};`,
);
out();
out('commit;');

const target = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));
writeFileSync(target, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${target}`);
