/**
 * Security audit as executable tests: what anonymous players and unauthenticated
 * visitors must NOT be able to do, enforced by RLS, column grants and RPC checks.
 * Round 4 (482913): Víkingur-A (home) vs KR-B (away).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, joinDevice, type Device, type TestDb } from './harness.ts';

let t: TestDb;
let enc: string;
let otherEnc: string;
let h1: Device;
let h2: Device;
let a1: Device;
let a2: Device;

const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (e) {
    return (e as Error).message;
  }
};
const anon = <T,>(sql: string, params?: unknown[]) => t.as(null, () => t.query<T>(sql, params));
const score = (d: Device, e: string, match: number, game: number, home: number, away: number) =>
  d.rpc('submit_game_score', {
    p_client_entry_id: randomUUID(), p_encounter_id: e, p_match_number: match, p_game_number: game, p_home_points: home, p_away_points: away,
  });

describe('security (database)', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    t = await createTestDb();
    h1 = await joinDevice(t, 'Isak Alfredsson', '482913');
    h2 = await joinDevice(t, 'Stefán Birkisson', '482913');
    a1 = await joinDevice(t, 'Karl Claesson', '482913');
    a2 = await joinDevice(t, 'Ellert Georgsson', '482913');
    enc = (await t.query<{ encounter_id: string }>('select encounter_id from public.round_sessions where auth_user_id = $1', [h1.userId]))[0].encounter_id;
    otherEnc = (await t.query<{ id: string }>('select id from public.encounters where round_id = (select round_id from public.encounters where id = $1) and id <> $1 limit 1', [enc]))[0].id;
    // Home lineup locked (hidden from away), away lineup proposed only.
    const pid = (n: string) => t.playerId(n);
    const home = await h1.rpc<{ lineup_id: string; version: number }>('propose_lineup', {
      p_encounter_id: enc, p_slots: JSON.stringify({ A: await pid('Isak Alfredsson'), B: await pid('Stefán Birkisson'), C: await pid('Daði Guðmundsson') }),
    });
    await h2.rpc('confirm_lineup', { p_lineup_id: home.lineup_id, p_version: home.version });
  });

  describe('anonymous player', () => {
    it('cannot read round access codes', async () => {
      expect(await h1.select('select code from public.round_access_codes')).toHaveLength(0);
    });

    it('cannot edit organizer data', async () => {
      expect(await err(h1.select("insert into public.clubs (name, short_name) values ('X', 'X')"))).toMatch(/row-level security/);
      await h1.select("update public.clubs set name = 'Hacked'");
      await h1.select('delete from public.teams');
      const clubs = await t.query<{ name: string }>('select name from public.clubs');
      expect(clubs.some((c) => c.name === 'Hacked')).toBe(false);
      expect((await t.query('select id from public.teams')).length).toBe(6);
      expect(await err(h1.select("update public.encounters set status = 'completed', home_score = 6 where id = $1", [enc]))).toBe('no error');
      expect((await t.query<{ status: string }>('select status from public.encounters where id = $1', [enc]))[0].status).not.toBe('completed');
    });

    it('cannot write raw entries, reconciled state or confirmations directly', async () => {
      expect(await err(h1.select(
        "insert into public.set_entries (encounter_id, match_number, game_number, side, home_points, away_points, client_entry_id) values ($1, 1, 1, 'home', 11, 0, gen_random_uuid())",
        [enc],
      ))).toMatch(/permission denied/);
      expect(await err(h1.select('update public.reconciled_set_states set home_points = 11'))).toMatch(/permission denied/);
      expect(await err(h1.select("insert into public.result_confirmations (encounter_id, side, auth_user_id, player_id) values ($1, 'home', $2, $3)", [enc, h1.userId, h1.playerId]))).toMatch(/permission denied/);
      expect(await err(h1.select("insert into public.lineups (encounter_id, team_id, side) select id, home_team_id, 'home' from public.encounters where id = $1", [enc]))).toMatch(/row-level security|duplicate/);
    });

    it("cannot edit another player's entry (or even their own) except through the RPC", async () => {
      // Reveal both lineups so scoring is possible.
      const away = await a1.rpc<{ lineup_id: string; version: number }>('propose_lineup', {
        p_encounter_id: enc,
        p_slots: JSON.stringify({ X: await t.playerId('Karl Claesson'), Y: await t.playerId('Ellert Georgsson'), Z: await t.playerId('Eiríkur Gunnarsson') }),
      });
      await a2.rpc('confirm_lineup', { p_lineup_id: away.lineup_id, p_version: away.version });
      await score(a1, enc, 1, 1, 11, 7);
      expect(await err(h1.select('update public.set_entries set home_points = 11, away_points = 0'))).toMatch(/permission denied/);
      expect(await err(h1.select('delete from public.set_entries'))).toMatch(/permission denied/);
      const [row] = await t.query<{ home_points: number; away_points: number }>('select home_points, away_points from public.set_entries where encounter_id = $1', [enc]);
      expect(row).toEqual({ home_points: 11, away_points: 7 });
    });

    it('cannot submit for an encounter their team does not play in', async () => {
      expect(await err(score(h1, otherEnc, 1, 1, 11, 0))).toContain('not_in_encounter');
      expect(await err(h1.rpc('propose_lineup', { p_encounter_id: otherEnc, p_slots: '{}' }))).toContain('not_in_encounter');
    });

    it('cannot confirm twice with the same player id', async () => {
      const [lineup] = await t.query<{ id: string; version: number }>("select id, version from public.lineups where encounter_id = $1 and side = 'home'", [enc]);
      const again = await h1.rpc<{ confirmed_count: number }>('confirm_lineup', { p_lineup_id: lineup.id, p_version: lineup.version });
      expect(again.confirmed_count).toBe(1); // unchanged: already locked, and duplicates never count
      const rows = await t.query<{ n: number }>('select count(*)::int as n from public.lineup_confirmations where lineup_id = $1 and player_id = $2', [lineup.id, h1.playerId]);
      expect(rows[0].n).toBe(1);
    });

    it('cannot alter an officially confirmed result through ordinary mutations', async () => {
      await t.query("update public.encounters set status = 'completed' where id = $1", [enc]); // simulate official
      expect(await err(score(a1, enc, 1, 1, 11, 3))).toContain('encounter_confirmed');
      await t.query('select public.recompute_encounter($1)', [enc]); // restore derived status
    });

    it('never sees auth user ids of other devices', async () => {
      expect(await err(a1.select('select auth_user_id from public.set_entries'))).toMatch(/permission denied/);
      expect(await err(a1.select('select auth_user_id from public.lineup_confirmations'))).toMatch(/permission denied/);
      expect(await err(a1.select('select auth_user_id from public.result_confirmations'))).toMatch(/permission denied/);
      expect(await a1.select('select auth_user_id from public.round_sessions')).toHaveLength(1); // only its own
    });

    it('cannot make itself an organizer', async () => {
      expect(await err(h1.select('insert into public.organizers (user_id) values ($1)', [h1.userId]))).toMatch(/row-level security|permission denied/);
      expect(await err(h1.select("select public.grant_organizer('x@example.com')"))).toMatch(/permission denied/);
    });
  });

  describe('unauthenticated public', () => {
    it('cannot see hidden lineups or doubles', async () => {
      // Another encounter of the round where no lineup has been revealed.
      const hiddenEnc = otherEnc;
      const slots = await anon<{ id: string }>(
        'select s.id from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.encounter_id = $1',
        [hiddenEnc],
      );
      expect(slots).toHaveLength(0);
      expect(await anon('select id from public.doubles_players')).toHaveLength(0);
    });

    it('cannot see raw scorer entries, audit log, codes or admin-only data', async () => {
      expect(await anon('select id from public.set_entries')).toHaveLength(0);
      expect(await anon('select id from public.audit_log')).toHaveLength(0);
      expect(await anon('select code from public.round_access_codes')).toHaveLength(0);
      expect(await anon('select user_id from public.organizers')).toHaveLength(0);
      expect(await anon('select encounter_id from public.game_corrections')).toHaveLength(0);
      expect(await anon('select auth_user_id from public.round_sessions')).toHaveLength(0);
      expect(await anon('select auth_user_id from public.player_device_profiles')).toHaveLength(0);
      expect(await anon('select id from public.join_attempts')).toHaveLength(0); // no policy at all
    });

    it('cannot call player or organizer RPCs', async () => {
      expect(await err(anon("select public.join_round('482913')"))).toMatch(/permission denied/);
      expect(await err(anon('select public.regenerate_round_code($1)', [randomUUID()]))).toMatch(/permission denied/);
      expect(await err(anon("select public.admin_set_encounter_status($1, 'cancelled')", [enc]))).toMatch(/permission denied/);
    });
  });

  it('the production league file never creates access codes', async () => {
    const sql = readFileSync(fileURLToPath(new URL('../production/league-2026-2027.sql', import.meta.url)), 'utf8');
    expect(sql).not.toMatch(/round_access_codes/);
    const fresh = await createTestDb({ seed: false });
    await fresh.db.exec(sql);
    const [counts] = await fresh.query<{ encounters: number; codes: number; players: number }>(
      'select (select count(*)::int from public.encounters) as encounters, (select count(*)::int from public.round_access_codes) as codes, (select count(*)::int from public.players) as players',
    );
    expect(counts).toEqual({ encounters: 30, codes: 0, players: 37 });
    // Every encounter still gets its ten derived match rows.
    const [{ n }] = await fresh.query<{ n: number }>('select count(*)::int as n from public.encounter_games');
    expect(n).toBe(300);
  });

  it('organizer bootstrap works from the SQL editor (owner) and is audited', async () => {
    const id = await t.createUser('Mothaldari@Example.com');
    await t.query("select public.grant_organizer('mothaldari@example.com')");
    expect(await t.query('select user_id from public.organizers where user_id = $1', [id])).toHaveLength(1);
    expect(await t.query("select id from public.audit_log where action = 'grant_organizer'")).toHaveLength(1);
    await t.query("select public.revoke_organizer('mothaldari@example.com')");
    expect(await t.query('select user_id from public.organizers where user_id = $1', [id])).toHaveLength(0);
  });
});
