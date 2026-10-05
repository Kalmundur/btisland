/**
 * Conflicted games can always be resolved: scorer correction -> cross-team agreement ->
 * organizer override. No majority voting; raw entries are never changed or deleted.
 * Round 4 (dev code 482913): Víkingur-A (home, A/B/C) vs KR-B (away, X/Y/Z).
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, joinDevice, type Device, type TestDb } from './harness.ts';

const CODE = '482913';

let t: TestDb;
let enc: string;
let h1: Device; // Isak (home) – the scorer whose phone "dies"
let h2: Device; // Stefán (home)
let a1: Device; // Karl (away)
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

type State = { status: string; home_points: number | null; away_points: number | null; duplicate: boolean; side: string };

const score = (d: Device, match: number, game: number, home: number, away: number) =>
  d.rpc<{ status: string }>('submit_game_score', {
    p_client_entry_id: randomUUID(), p_encounter_id: enc, p_match_number: match, p_game_number: game, p_home_points: home, p_away_points: away,
  });
const resolve = (d: Device, match: number, game: number, home: number, away: number, requestId = randomUUID()) =>
  d.rpc<State>('confirm_game_resolution', {
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
const confirmations = (match: number, game: number) =>
  t.query<{ side: string; player_id: string; home_points: number; away_points: number; superseded: boolean }>(
    `select side, player_id, home_points, away_points, superseded_at is not null as superseded
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
  expect((await state(1, 1)).status).toBe('conflict');
}

describe('conflict resolution (database)', { timeout: 60_000 }, () => {
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

  it('1. the scorer corrects their own entry; pending team confirmations become moot (kept)', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await score(h1, 1, 1, 11, 9); // Isak fixes his own entry
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9 });
    expect(await confirmations(1, 1)).toEqual([expect.objectContaining({ side: 'home', superseded: true })]);
  });

  it('2+10+11+12. scorer gone: one home + one away player agree -> resolved, raw entries kept, scoring continues', async () => {
    await conflictInMatch1();
    // Isak's phone dies. Stefán (home) and Ellert (away) settle it.
    const home = await resolve(h2, 1, 1, 11, 9);
    expect(home).toMatchObject({ status: 'conflict', side: 'home' });
    const away = await resolve(a2, 1, 1, 11, 9);
    expect(away).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9, side: 'away' });
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9, corrected: false });

    // 10: both original raw submissions, with their scorers, are still stored unchanged.
    expect(await rawEntries(1, 1)).toEqual([
      { submitted_by_player_id: p.Isak, home_points: 11, away_points: 8 },
      { submitted_by_player_id: p.Karl, home_points: 11, away_points: 9 },
    ]);

    // Scoring continues: game 2 can now be entered (game 1 counts as recorded).
    await win(h2, 1, 'home', 2);
    // 11: match result follows the resolved game.
    const [m1] = await t.query<{ status: string; winner: string; home_games: number }>(
      'select status, winner, home_games from public.encounter_games where encounter_id = $1 and match_number = 1', [enc],
    );
    expect(m1).toMatchObject({ status: 'completed', winner: 'home', home_games: 3 });
    // 12: encounter score follows the match.
    expect(await encounterRow()).toMatchObject({ home_score: 1, away_score: 0 });

    // A resolved game cannot be re-opened by players.
    expect(await err(resolve(a1, 1, 1, 11, 8))).toContain('not_in_conflict');
  });

  it('3. a home confirmation alone does not resolve', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    expect(await state(1, 1)).toMatchObject({ status: 'conflict', home_points: null });
    const [m1] = await t.query<{ status: string; winner: string | null }>(
      'select status, winner from public.encounter_games where encounter_id = $1 and match_number = 1', [enc],
    );
    expect(m1).toMatchObject({ status: 'conflict', winner: null }); // the match stays blocked
  });

  it('4. teams confirming different scores stay conflicted until one side revises', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await resolve(a2, 1, 1, 11, 8);
    expect((await state(1, 1)).status).toBe('conflict');
    await resolve(a2, 1, 1, 11, 9); // away revises its own confirmation
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9 });
    const rows = await confirmations(1, 1);
    expect(rows.filter((r) => r.side === 'away').map((r) => r.superseded)).toEqual([true, false]);
  });

  it('5. a second home player supersedes the home confirmation; history is kept', async () => {
    await conflictInMatch1();
    await resolve(h1, 1, 1, 11, 8);
    await resolve(h2, 1, 1, 11, 9);
    const rows = await confirmations(1, 1);
    expect(rows).toEqual([
      expect.objectContaining({ side: 'home', player_id: p.Isak, home_points: 11, away_points: 8, superseded: true }),
      expect.objectContaining({ side: 'home', player_id: p.Stefán, home_points: 11, away_points: 9, superseded: false }),
    ]);
    const audited = await t.query<{ n: number }>(
      "select count(*)::int as n from public.audit_log where entity_table = 'game_conflict_confirmations'",
    );
    expect(audited[0].n).toBeGreaterThanOrEqual(3); // 2 inserts + 1 supersede
  });

  it('6+7. no majority voting: two home players (or many raw entries) never resolve without the away team', async () => {
    await conflictInMatch1();
    await score(h2, 1, 1, 11, 8); // two raw entries say 11–8, one says 11–9
    expect((await state(1, 1)).status).toBe('conflict');
    await resolve(h1, 1, 1, 11, 8);
    await resolve(h2, 1, 1, 11, 8); // same team, same score: no extra row, still one voice
    expect((await confirmations(1, 1)).filter((r) => !r.superseded)).toHaveLength(1);
    expect((await state(1, 1)).status).toBe('conflict');
    // A player only ever confirms for their own team: the side comes from the session.
    const karl = await resolve(a1, 1, 1, 11, 9);
    expect(karl.side).toBe('away');
    expect((await state(1, 1)).status).toBe('conflict'); // 11–8 vs 11–9: teams disagree
  });

  it('8. players outside the encounter cannot resolve', async () => {
    await conflictInMatch1();
    const other = await joinDevice(t, 'Zhao Liu', CODE); // BH-A: same round, another encounter
    expect(await err(resolve(other, 1, 1, 11, 9))).toContain('not_in_encounter');
    const noSession = await t.createUser(); // signed in, but never joined this round
    expect(await err(t.as(noSession, () => t.query("select public.confirm_game_resolution(gen_random_uuid(), $1, 1, 1, 11, 9)", [enc]))))
      .toContain('not_in_encounter');
    expect(await err(t.as(null, () => t.query("select public.confirm_game_resolution(gen_random_uuid(), $1, 1, 1, 11, 9)", [enc]))))
      .toMatch(/permission denied/);
  });

  it('9. organizer override wins over everything and is audited; clearing it falls back to the team agreement', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await resolve(a2, 1, 1, 11, 9);
    await asOrg('select public.admin_correct_game($1, 1, 1, 11, 7, $2)', [enc, 'Dómari staðfesti 11–7']);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 7, corrected: true });
    const [audit] = await t.query<{ actor_user_id: string; details: { before: { home: number; away: number }; after: { home: number; away: number } } }>(
      "select actor_user_id, details from public.audit_log where action = 'correct_game' order by id desc limit 1",
    );
    expect(audit.actor_user_id).toBe(org);
    expect(audit.details.before).toMatchObject({ home: 11, away: 9 });
    expect(audit.details.after).toMatchObject({ home: 11, away: 7 });
    expect(await rawEntries(1, 1)).toHaveLength(2);

    await asOrg('select public.admin_clear_correction($1, 1, 1, $2)', [enc, 'afturkallað']);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9, corrected: false });
  });

  it('9b. an organizer can resolve a conflict alone', async () => {
    await conflictInMatch1();
    await asOrg('select public.admin_correct_game($1, 1, 1, 11, 9, null)', [enc]);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 11, away_points: 9 });
  });

  it('13. a later organizer change to a team-resolved result invalidates the final confirmations', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    await resolve(a2, 1, 1, 11, 9);
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
    // Players cannot touch a confirmed result.
    expect(await err(resolve(h2, 1, 1, 11, 9))).toContain('encounter_confirmed');

    for (const g of [1, 2, 3]) await asOrg(`select public.admin_correct_game($1, 1, ${g}, 4, 11, $2)`, [enc, 'leiðrétting']);
    const after = await encounterRow();
    expect(after).toMatchObject({ home_score: 5, away_score: 2, status: 'in_progress' });
    expect(after.result_version).toBeGreaterThan(e.result_version);
    expect(await t.query('select 1 from public.result_confirmations where encounter_id = $1 and result_hash = $2', [enc, after.result_hash]))
      .toHaveLength(0);
  });

  it('14. confirmations reach participants through realtime', async () => {
    const rows = await t.query("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_conflict_confirmations'");
    expect(rows).toHaveLength(1);
  });

  it('15. retries with the same request id are idempotent', async () => {
    await conflictInMatch1();
    const id = randomUUID();
    const first = await resolve(h2, 1, 1, 11, 9, id);
    const retry = await resolve(h2, 1, 1, 11, 9, id);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    await resolve(h2, 1, 1, 11, 9); // a double tap with a new id but the same score
    expect(await confirmations(1, 1)).toHaveLength(1);
    expect(await err(resolve(a1, 1, 1, 11, 9, id))).toContain('client_request_conflict');
  });

  it('16. only valid scores, only conflicted games', async () => {
    await conflictInMatch1();
    for (const [h, a] of [[11, 10], [12, 9], [11, 11], [5, 3]]) {
      expect(await err(resolve(h2, 1, 1, h, a))).toContain('invalid_game_score');
    }
    // A score neither scorer entered is allowed if it is valid (both entries may be wrong).
    await resolve(h2, 1, 1, 12, 10);
    await resolve(a2, 1, 1, 12, 10);
    expect(await state(1, 1)).toMatchObject({ status: 'agreed', home_points: 12, away_points: 10 });
    await score(h1, 2, 1, 11, 3);
    expect(await err(resolve(h2, 2, 1, 11, 3))).toContain('not_in_conflict');
    expect(await confirmations(2, 1)).toHaveLength(0);
  });

  it('17. the public sees only the neutral state and the result, never who confirmed', async () => {
    await conflictInMatch1();
    await resolve(h2, 1, 1, 11, 9);
    expect(await err(t.as(null, () => t.query('select * from public.game_conflict_confirmations')))).toMatch(/permission denied/);
    expect(await t.as(null, () => t.query('select status, home_points from public.reconciled_set_states where encounter_id = $1', [enc])))
      .toEqual([{ status: 'conflict', home_points: null }]);
    // Participants may see the confirmations (not the auth user ids); outsiders see none.
    expect(await a1.select('select side, player_id, home_points from public.game_conflict_confirmations')).toHaveLength(1);
    expect(await err(a1.select('select auth_user_id from public.game_conflict_confirmations'))).toMatch(/permission denied/);
    const other = await joinDevice(t, 'Zhao Liu', CODE);
    expect(await other.select('select id from public.game_conflict_confirmations')).toHaveLength(0);
    // Players can never write confirmations directly.
    expect(await err(h2.select(
      "insert into public.game_conflict_confirmations (encounter_id, match_number, game_number, side, player_id, home_points, away_points, client_request_id) values ($1, 1, 1, 'home', $2, 11, 9, gen_random_uuid())",
      [enc, p.Stefán],
    ))).toMatch(/permission denied/);

    await resolve(a2, 1, 1, 11, 9);
    expect(await t.as(null, () => t.query('select status, home_points, away_points from public.reconciled_set_states where encounter_id = $1', [enc])))
      .toEqual([{ status: 'agreed', home_points: 11, away_points: 9 }]);
  });
});
