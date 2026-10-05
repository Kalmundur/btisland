/**
 * Conflicted games are resolved by ONE identified player of either participating team.
 * Precedence: organizer correction > newest player resolution > identical raw entries.
 * No majority voting; raw entries are never changed or deleted.
 * Round 4 (dev code 482913): Víkingur-A (home, A/B/C) vs KR-B (away, X/Y/Z).
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, joinDevice, type Device, type TestDb } from './harness.ts';

const CODE = '482913';

let t: TestDb;
let enc: string;
let h1: Device; // Isak (home) – entered 11–8
let h2: Device; // Stefán (home)
let a1: Device; // Karl (away) – entered 11–9
let a2: Device; // Ellert (away)
let org: string;
const p: Record<string, string> = {};

const err = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'no error';
  } catch (e) {
    return (e as Error).message;
  }
};

type Result = { status: string; home_points: number | null; away_points: number | null; duplicate: boolean };

const score = (d: Device, match: number, game: number, home: number, away: number) =>
  d.rpc<{ status: string }>('submit_game_score', {
    p_client_entry_id: randomUUID(), p_encounter_id: enc, p_match_number: match, p_game_number: game, p_home_points: home, p_away_points: away,
  });
const resolve = (d: Device, match: number, game: number, home: number, away: number, requestId = randomUUID()) =>
  d.rpc<Result>('confirm_game_resolution', {
    p_client_request_id: requestId, p_encounter_id: enc, p_match_number: match, p_game_number: game, p_home_points: home, p_away_points: away,
  });
const win = async (d: Device, match: number, w: 'home' | 'away', fromGame = 1) => {
  for (let g = fromGame; g <= 3; g++) await score(d, match, g, w === 'home' ? 11 : 4, w === 'home' ? 4 : 11);
};
const state = async (match: number, game: number) =>
  (await t.query<{ status: string; home_points: number | null; away_points: number | null; corrected: boolean }>(
    'select status, home_points, away_points, corrected from public.reconciled_set_states where encounter_id = $1 and match_number = $2 and game_number = $3',
    [enc, match, game],
  ))[0];
const resolutions = (match: number, game: number) =>
  t.query<{ side: string; player_id: string; home_points: number; away_points: number; superseded: boolean; has_session: boolean; created_at: string }>(
    `select side, player_id, home_points, away_points, superseded_at is not null as superseded,
            round_session_id is not null as has_session, created_at
       from public.game_conflict_confirmations where encounter_id = $1 and match_number = $2 and game_number = $3 order by created_at, id`,
    [enc, match, game],
  );
const rawEntries = (match: number, game: number) =>
  t.query<{ submitted_by_player_id: string; home_points: number; away_points: number }>(
    'select submitted_by_player_id, home_points, away_points from public.set_entries where encounter_id = $1 and match_number = $2 and game_number = $3 order by home_points, away_points',
    [enc, match, game],
  );
const encounterRow = async () =>
  (await t.query<{ status: string; home_score: number; away_score: number; result_hash: string; result_version: number }>(
    'select status, home_score, away_score, result_hash, result_version from public.encounters where id = $1', [enc],
  ))[0];
const matchRow = async (match: number) =>
  (await t.query<{ status: string; winner: string | null; home_games: number; away_games: number }>(
    'select status, winner, home_games, away_games from public.encounter_games where encounter_id = $1 and match_number = $2', [enc, match],
  ))[0];
const asOrg = (sql: string, params: unknown[]) => t.as(org, () => t.query(sql, params));

async function lockLineups() {
  await h1.rpc('propose_lineup', { p_encounter_id: enc, p_slots: JSON.stringify({ A: p.Isak, B: p.Stefán, C: p.Daði }) });
  await a1.rpc('propose_lineup', { p_encounter_id: enc, p_slots: JSON.stringify({ X: p.Karl, Y: p.Ellert, Z: p.Eiríkur }) });
}

/** The example from the requirements: Isak enters 11–8, Karl enters 11–9 in match 1, game 1. */
async function conflictInMatch1() {
  await lockLineups();
  await score(h1, 1, 1, 11, 8);
  await score(a1, 1, 1, 11, 9);
}

describe('conflict resolution by one player (database)', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    t = await createTestDb();
    h1 = await joinDevice(t, 'Isak Alfredsson', CODE);
    h2 = await joinDevice(t, 'Stefán Birkisson', CODE);
    a1 = await joinDevice(t, 'Karl Claesson', CODE);
    a2 = await joinDevice(t, 'Ellert Georgsson', CODE);
    enc = (await t.query<{ encounter_id: string }>('select encounter_id from public.round_sessions where auth_user_id = $1', [h1.userId]))[0].encounter_id;
    org = await t.createUser();
    await t.query('insert into public.organizers (user_id) values ($1)', [org]);
    for (const n of ['Isak Alfredsson', 'Stefán Birkisson', 'Daði Guðmundsson', 'Hugo Nylen', 'Karl Claesson', 'Ellert Georgsson', 'Eiríkur Gunnarsson', 'Lúkas Ólason']) {
      p[n.split(' ')[0]] = await t.playerId(n);
    }
  });

  it('1. two different raw scores create a conflict', async () => {
    await conflictInMatch1();
    expect(await state(1, 1)).toMatchObject({ status: 'conflict', home_points: null, away_points: null });
  });

  it('2+5+10+11+12+13. the original scorer resolves it alone; history and raw entries are kept; match and encounter follow', async () => {
    await conflictInMatch1();
    const r = await resolve(h1, 1, 1, 11, 9);
    expect(r).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9, duplicate: false });
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9, corrected: false });
    // 10: both original raw submissions, with their scorers, are untouched.
    expect(await rawEntries(1, 1)).toEqual([
      { submitted_by_player_id: p.Isak, home_points: 11, away_points: 8 },
      { submitted_by_player_id: p.Karl, home_points: 11, away_points: 9 },
    ]);
    // 11: who resolved it, from which session, and when.
    const [res] = await resolutions(1, 1);
    expect(res).toMatchObject({ player_id: p.Isak, side: 'home', home_points: 11, away_points: 9, superseded: false, has_session: true });
    expect(res.created_at).toBeTruthy();
    // 12+13: scoring continues; the match and the encounter score follow the resolved game.
    await win(h2, 1, 'home', 2);
    expect(await matchRow(1)).toMatchObject({ status: 'completed', winner: 'home', home_games: 3, away_games: 0 });
    expect(await encounterRow()).toMatchObject({ home_score: 1, away_score: 0 });
  });

  it('3. another home-team player may resolve it', async () => {
    await conflictInMatch1();
    expect(await resolve(h2, 1, 1, 11, 9)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9 });
  });

  it('4. another away-team player may resolve it', async () => {
    await conflictInMatch1();
    expect(await resolve(a2, 1, 1, 11, 8)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 8 });
    expect((await resolutions(1, 1))[0]).toMatchObject({ side: 'away', player_id: p.Ellert });
  });

  it('6+7. unrelated-team players and the public cannot resolve', async () => {
    await conflictInMatch1();
    const other = await joinDevice(t, 'Zhao Liu', CODE); // BH-A: same round, another encounter
    expect(await err(resolve(other, 1, 1, 11, 9))).toContain('not_in_encounter');
    const noSession = await t.createUser(); // signed in, but never joined this round
    expect(await err(t.as(noSession, () => t.query('select public.confirm_game_resolution(gen_random_uuid(), $1, 1, 1, 11, 9)', [enc]))))
      .toContain('not_in_encounter');
    expect(await err(t.as(null, () => t.query('select public.confirm_game_resolution(gen_random_uuid(), $1, 1, 1, 11, 9)', [enc]))))
      .toMatch(/permission denied/);
    expect((await state(1, 1)).status).toBe('conflict');
    expect(await resolutions(1, 1)).toHaveLength(0);
  });

  it('8+9. a valid different score resolves; invalid scores and games without a conflict are refused', async () => {
    await conflictInMatch1();
    for (const [h, a] of [[10, 8], [10, 10], [11, 10], [12, 9], [15, 12]]) {
      expect(await err(resolve(h2, 1, 1, h, a))).toContain('invalid_game_score');
    }
    expect((await state(1, 1)).status).toBe('conflict');
    expect(await resolve(a2, 1, 1, 12, 10)).toMatchObject({ status: 'agreed', home_points: 12, away_points: 10 });
    await score(h1, 2, 1, 11, 3);
    expect(await err(resolve(h2, 2, 1, 11, 3))).toContain('not_in_conflict');
  });

  it('14. the change reaches clients through realtime', async () => {
    const pub = await t.query<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('game_conflict_confirmations', 'reconciled_set_states', 'encounter_games', 'encounters') order by tablename",
    );
    expect(pub.map((r) => r.tablename)).toEqual(['encounter_games', 'encounters', 'game_conflict_confirmations', 'reconciled_set_states']);
    await conflictInMatch1();
    await resolve(a2, 1, 1, 11, 9);
    // The public row the scorecards and spectators listen to is updated in place.
    expect(await t.as(null, () => t.query('select status, home_points, away_points from public.reconciled_set_states where encounter_id = $1', [enc])))
      .toEqual([{ status: 'agreed', home_points: 11, away_points: 9 }]);
  });

  it('15+16. a later correction before final confirmation wins; the earlier resolution is kept as history', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await resolve(a1, 1, 1, 11, 8); // Karl notices it was really 11–8
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 8 });
    expect(await resolutions(1, 1)).toEqual([
      expect.objectContaining({ player_id: p.Stefán, home_points: 11, away_points: 9, superseded: true }),
      expect.objectContaining({ player_id: p.Karl, home_points: 11, away_points: 8, superseded: false }),
    ]);
    // A raw edit afterwards does not silently override the explicit decision.
    await score(h1, 1, 1, 11, 6);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 8 });
  });

  it('17+18. after final confirmation players cannot change it; the organizer still can', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await win(h1, 1, 'home', 2);
    for (const m of [2, 3, 4, 5]) await win(h1, m, 'home');
    await win(h1, 6, 'away');
    await h1.rpc('propose_doubles', { p_encounter_id: enc, p_player1: p.Isak, p_player2: p.Hugo });
    await a1.rpc('propose_doubles', { p_encounter_id: enc, p_player1: p.Karl, p_player2: p.Lúkas });
    await win(h1, 7, 'home');
    let e = await encounterRow();
    expect(e).toMatchObject({ home_score: 6, away_score: 1, status: 'awaiting_confirmation' });
    await h1.rpc('confirm_result', { p_encounter_id: enc, p_result_hash: e.result_hash });
    await a1.rpc('confirm_result', { p_encounter_id: enc, p_result_hash: e.result_hash });
    e = await encounterRow();
    expect(e.status).toBe('completed');
    // 17: ordinary players cannot change a confirmed result.
    expect(await err(resolve(a2, 1, 1, 11, 8))).toContain('encounter_confirmed');
    expect(await state(1, 1)).toMatchObject({ home_points: 11, away_points: 9 });

    // 18: organizer correction wins (audited) and reopens the result for confirmation.
    for (const g of [1, 2, 3]) await asOrg(`select public.admin_correct_game($1, 1, ${g}, 4, 11, $2)`, [enc, 'leiðrétting']);
    const after = await encounterRow();
    expect(after).toMatchObject({ home_score: 5, away_score: 2, status: 'in_progress' });
    expect(after.result_version).toBeGreaterThan(e.result_version);
    expect(await state(1, 1)).toMatchObject({ home_points: 4, away_points: 11, corrected: true });
    expect(await t.query("select 1 from public.audit_log where action = 'correct_game' and entity_id = $1", [enc])).toHaveLength(3);
  });

  it('18b. an organizer can resolve a conflict directly; clearing it falls back to the player resolution', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await asOrg('select public.admin_correct_game($1, 1, 1, 11, 7, $2)', [enc, 'Dómari staðfesti 11–7']);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 7, corrected: true });
    await asOrg('select public.admin_clear_correction($1, 1, 1, $2)', [enc, 'afturkallað']);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9, corrected: false });
  });

  it('19. duplicate/retried requests are idempotent', async () => {
    await conflictInMatch1();
    const id = randomUUID();
    expect((await resolve(h2, 1, 1, 11, 9, id)).duplicate).toBe(false);
    expect((await resolve(h2, 1, 1, 11, 9, id)).duplicate).toBe(true);
    await resolve(a2, 1, 1, 11, 9); // someone else confirms the same score: no new row
    expect(await resolutions(1, 1)).toHaveLength(1);
    expect(await err(resolve(a1, 1, 1, 11, 9, id))).toContain('client_request_conflict');
  });

  it('privacy: the public never sees who resolved or the raw submissions; players cannot write directly', async () => {
    await conflictInMatch1();
    expect(await err(t.as(null, () => t.query('select * from public.game_conflict_confirmations')))).toMatch(/permission denied/);
    expect(await t.as(null, () => t.query('select status, home_points from public.reconciled_set_states where encounter_id = $1', [enc])))
      .toEqual([{ status: 'conflict', home_points: null }]);
    await resolve(h2, 1, 1, 11, 9);
    expect(await a1.select('select side, player_id, home_points from public.game_conflict_confirmations')).toHaveLength(1);
    expect(await err(a1.select('select auth_user_id from public.game_conflict_confirmations'))).toMatch(/permission denied/);
    const other = await joinDevice(t, 'Zhao Liu', CODE);
    expect(await other.select('select id from public.game_conflict_confirmations')).toHaveLength(0);
    expect(await err(h2.select(
      "insert into public.game_conflict_confirmations (encounter_id, match_number, game_number, side, player_id, home_points, away_points, client_request_id) values ($1, 1, 1, 'home', $2, 11, 9, gen_random_uuid())",
      [enc, p.Stefán],
    ))).toMatch(/permission denied/);
  });
});
