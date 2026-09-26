/**
 * End-to-end database tests for the league-match workflow (RLS, RPCs, triggers).
 * Round 4 (dev code 482913): Víkingur-A (home, A/B/C) vs KR-B (away, X/Y/Z).
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, joinDevice, type Device, type TestDb } from './harness.ts';

const CODE = '482913';

interface Ctx {
  t: TestDb;
  enc: string;
  h1: Device;
  h2: Device;
  a1: Device;
  a2: Device;
  a3: Device;
  org: string;
  p: Record<string, string>;
}

async function setup(): Promise<Ctx> {
  const t = await createTestDb();
  const h1 = await joinDevice(t, 'Isak Alfredsson', CODE);
  const h2 = await joinDevice(t, 'Stefán Birkisson', CODE);
  const a1 = await joinDevice(t, 'Karl Claesson', CODE);
  const a2 = await joinDevice(t, 'Ellert Georgsson', CODE);
  const a3 = await joinDevice(t, 'Eiríkur Gunnarsson', CODE);
  const [{ encounter_id: enc }] = await t.query<{ encounter_id: string }>(
    'select encounter_id from public.round_sessions where auth_user_id = $1',
    [h1.userId],
  );
  const org = await t.createUser();
  await t.query('insert into public.organizers (user_id) values ($1)', [org]);
  const names = ['Isak Alfredsson', 'Stefán Birkisson', 'Daði Guðmundsson', 'Hugo Nylen', 'Karl Claesson', 'Ellert Georgsson', 'Eiríkur Gunnarsson', 'Lúkas Ólason'];
  const p: Record<string, string> = {};
  for (const n of names) p[n.split(' ')[0]] = await t.playerId(n);
  return { t, enc, h1, h2, a1, a2, a3, org, p };
}

const err = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'no error';
  } catch (e) {
    return (e as Error).message;
  }
};

async function lockLineups(c: Ctx) {
  // A submitted lineup is locked immediately (one confirmation).
  await c.h1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Isak, B: c.p.Stefán, C: c.p.Daði }) });
  await c.a1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ X: c.p.Karl, Y: c.p.Ellert, Z: c.p.Eiríkur }) });
}

async function lockDoubles(c: Ctx) {
  // A submitted pair is locked immediately (one confirmation).
  await c.h1.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Isak, p_player2: c.p.Hugo });
  await c.a1.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Karl, p_player2: c.p.Lúkas });
}

const score = (d: Device, enc: string, match: number, game: number, home: number, away: number, clientId = randomUUID()) =>
  d.rpc<{ status: string; home_points: number | null; away_points: number | null; submitter_count: number; duplicate: boolean }>(
    'submit_game_score',
    { p_client_entry_id: clientId, p_encounter_id: enc, p_match_number: match, p_game_number: game, p_home_points: home, p_away_points: away },
  );

async function winMatch(d: Device, enc: string, match: number, winner: 'home' | 'away') {
  for (let g = 1; g <= 3; g++) await score(d, enc, match, g, winner === 'home' ? 11 : 5, winner === 'home' ? 5 : 11);
}

const games = (c: Ctx) =>
  c.t.query<{ match_number: number; status: string; winner: string | null; home_games: number; away_games: number }>(
    'select match_number, status, winner, home_games, away_games from public.encounter_games where encounter_id = $1 order by match_number',
    [c.enc],
  );
const encounter = (c: Ctx) =>
  c.t.query<{ status: string; home_score: number | null; away_score: number | null; result_hash: string; result_version: number; final_report: unknown }>(
    'select status, home_score, away_score, result_hash, result_version, final_report from public.encounters where id = $1',
    [c.enc],
  ).then((r) => r[0]);

describe('match workflow (database)', { timeout: 60_000 }, () => {
  let c: Ctx;
  beforeEach(async () => {
    c = await setup();
  });

  it('creates the ten-match format for every encounter', async () => {
    const rows = await games(c);
    expect(rows.map((r) => r.match_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.every((r) => r.status === 'locked')).toBe(true);
    const fmt = await c.t.query<{ home_slot: string | null; away_slot: string | null }>(
      'select home_slot, away_slot from public.match_format order by match_number',
    );
    expect(fmt.map((f) => `${f.home_slot ?? 'D'}${f.away_slot ?? 'D'}`)).toEqual(
      ['AY', 'BZ', 'CX', 'AZ', 'BX', 'CY', 'DD', 'AX', 'BY', 'CZ'],
    );
  });

  it('lineup: distinct registered players, locked on submit, changeable until both teams submit', async () => {
    expect(await err(c.h1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Isak, B: c.p.Isak, C: c.p.Daði }) })))
      .toContain('duplicate_player');
    expect(await err(c.h1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Isak, B: c.p.Karl, C: c.p.Daði }) })))
      .toContain('player_not_registered');
    expect(await err(c.h1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ X: c.p.Isak, Y: c.p.Stefán, Z: c.p.Daði }) })))
      .toContain('invalid_lineup');

    // One confirmation is enough: the submitter's proposal locks the lineup at once.
    const home = await c.h1.rpc<{ lineup_id: string; version: number; confirmed_count: number; locked: boolean }>('propose_lineup', {
      p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Isak, B: c.p.Stefán, C: c.p.Daði }),
    });
    expect(home).toMatchObject({ version: 1, confirmed_count: 1, locked: true });
    expect(await c.h2.rpc('confirm_lineup', { p_lineup_id: home.lineup_id, p_version: 1 })).toMatchObject({ confirmed_count: 1, locked: true });

    // The opponent has not submitted yet, so the team may still change it: new version, still locked.
    const changed = await c.h2.rpc<{ version: number; confirmed_count: number; locked: boolean }>('propose_lineup', {
      p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Stefán, B: c.p.Isak, C: c.p.Daði }),
    });
    expect(changed).toMatchObject({ version: 2, confirmed_count: 1, locked: true });

    // Opponent sees status only and cannot confirm; still hidden from everyone until the away lineup is submitted.
    expect(await c.a1.select('select confirmed_count from public.lineups where encounter_id = $1', [c.enc])).toEqual([{ confirmed_count: 1 }]);
    expect(await err(c.a1.rpc('confirm_lineup', { p_lineup_id: home.lineup_id, p_version: 1 }))).toContain('forbidden');
    expect(await c.a1.select('select * from public.lineup_slots')).toHaveLength(0);
    expect(await c.t.as(null, () => c.t.query('select * from public.lineup_slots'))).toHaveLength(0);
    expect(await c.h2.select('select * from public.lineup_slots')).toHaveLength(3);
    expect((await games(c)).slice(0, 6).every((g) => g.status === 'locked')).toBe(true);

    await c.a1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ X: c.p.Karl, Y: c.p.Ellert, Z: c.p.Eiríkur }) });

    expect(await c.t.as(null, () => c.t.query('select * from public.lineup_slots'))).toHaveLength(6);
    expect((await encounter(c)).status).toBe('lineups');
    expect((await games(c)).slice(0, 6).every((g) => g.status === 'available')).toBe(true);
    expect(await c.t.as(null, () => c.t.query("select s.player_id from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.side = 'home' and s.slot = 'A'")))
      .toEqual([{ player_id: c.p.Stefán }]);

    // Both teams have submitted: players can no longer change either lineup.
    expect(await err(c.h1.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Isak, B: c.p.Stefán, C: c.p.Daði }) })))
      .toContain('lineup_locked');
    expect(await err(c.a2.rpc('propose_lineup', { p_encounter_id: c.enc, p_slots: JSON.stringify({ X: c.p.Ellert, Y: c.p.Karl, Z: c.p.Eiríkur }) })))
      .toContain('lineup_locked');
    // Organizer sees every confirmation row, including the superseded home v1.
    expect(await c.t.as(c.org, () => c.t.query('select id, player_id from public.lineup_confirmations'))).toHaveLength(3);
  });

  it('game entry rules: phase gating, valid scores, no games after 3 wins, no gaps', async () => {
    expect(await err(score(c.h1, c.enc, 1, 1, 11, 5))).toContain('match_not_available');
    await lockLineups(c);

    expect(await err(score(c.h1, c.enc, 7, 1, 11, 5))).toContain('match_not_available');
    expect(await err(score(c.h1, c.enc, 8, 1, 11, 5))).toContain('match_not_available');
    for (const [h, a] of [[11, 10], [10, 8], [12, 9], [13, 10], [15, 12], [10, 10]]) {
      expect(await err(score(c.h1, c.enc, 1, 1, h, a))).toContain('invalid_game_score');
    }
    expect(await err(score(c.h1, c.enc, 1, 2, 11, 5))).toContain('previous_game_missing');

    await score(c.h1, c.enc, 1, 1, 18, 16);
    await score(c.h1, c.enc, 1, 2, 9, 11);
    await score(c.h1, c.enc, 1, 3, 11, 9);
    await score(c.h1, c.enc, 1, 4, 13, 11);
    let g1 = (await games(c))[0];
    expect(g1).toMatchObject({ status: 'completed', winner: 'home', home_games: 3, away_games: 1 });
    expect(await err(score(c.h1, c.enc, 1, 5, 11, 5))).toContain('match_already_decided');

    // Correcting an earlier game recalculates the match (3–1 -> 2–2, back in progress).
    await score(c.h1, c.enc, 1, 1, 16, 18);
    g1 = (await games(c))[0];
    expect(g1).toMatchObject({ status: 'in_progress', winner: null, home_games: 2, away_games: 2 });
    await score(c.h1, c.enc, 1, 5, 7, 11);
    expect((await games(c))[0]).toMatchObject({ status: 'completed', winner: 'away', home_games: 2, away_games: 3 });
    expect(await encounter(c)).toMatchObject({ home_score: 0, away_score: 1, status: 'in_progress' });
  });

  it('conflicts: no majority voting, public neutral state, resolution by editing own entry', async () => {
    await lockLineups(c);
    await score(c.h1, c.enc, 2, 1, 11, 8);
    await score(c.a1, c.enc, 2, 1, 11, 8);
    const third = await score(c.a2, c.enc, 2, 1, 11, 9);
    expect(third).toMatchObject({ status: 'conflict', home_points: null, away_points: null, submitter_count: 3 });

    const publicView = await c.t.as(null, () =>
      c.t.query('select status, home_points, away_points from public.reconciled_set_states where encounter_id = $1', [c.enc]),
    );
    expect(publicView).toEqual([{ status: 'conflict', home_points: null, away_points: null }]);
    expect(await c.t.as(null, () => c.t.query('select id from public.set_entries'))).toHaveLength(0);
    expect(await c.a1.select('select id, submitted_by_player_id from public.set_entries')).toHaveLength(3); // participants may inspect
    expect((await games(c))[1].status).toBe('conflict');

    // Ellert corrects his own entry -> all agree -> published immediately.
    const resolved = await score(c.a2, c.enc, 2, 1, 11, 8);
    expect(resolved).toMatchObject({ status: 'agreed', home_points: 11, away_points: 8, submitter_count: 3 });

    // A previously agreed game can become conflicted again.
    const flipped = await score(c.a1, c.enc, 2, 1, 11, 7);
    expect(flipped.status).toBe('conflict');
    // Raw history is never lost: every change is in the audit log.
    const audited = await c.t.query<{ n: number }>(
      "select count(*)::int as n from public.audit_log where entity_table = 'set_entries'",
    );
    expect(audited[0].n).toBeGreaterThanOrEqual(5);
  });

  it('idempotent client entry ids make retries safe', async () => {
    await lockLineups(c);
    const id = randomUUID();
    const first = await score(c.h1, c.enc, 3, 1, 11, 4, id);
    const retry = await score(c.h1, c.enc, 3, 1, 11, 4, id);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    const rows = await c.t.query('select * from public.set_entries where encounter_id = $1', [c.enc]);
    expect(rows).toHaveLength(1);
    expect(await err(score(c.a1, c.enc, 3, 1, 11, 4, id))).toContain('client_entry_conflict');
  });

  it('concurrent scorers on two tables keep independent, correct state', async () => {
    await lockLineups(c);
    await Promise.all([
      winMatch(c.h1, c.enc, 1, 'home'),
      winMatch(c.a1, c.enc, 2, 'away'),
      winMatch(c.h2, c.enc, 3, 'home'),
      (async () => {
        await score(c.a2, c.enc, 1, 1, 11, 5); // second scorer on table 1 agrees
        await score(c.a3, c.enc, 4, 1, 3, 11);
      })(),
    ]);
    const rows = await games(c);
    expect(rows.slice(0, 4).map((r) => r.status)).toEqual(['completed', 'completed', 'completed', 'in_progress']);
    expect(await encounter(c)).toMatchObject({ home_score: 2, away_score: 1 });
    const reconciledMatch1 = await c.t.query<{ submitter_count: number }>(
      'select submitter_count from public.reconciled_set_states where encounter_id = $1 and match_number = 1 and game_number = 1',
      [c.enc],
    );
    expect(reconciledMatch1[0].submitter_count).toBe(2);
  });

  it('doubles only after matches 1–6, hidden until both teams lock, then phase 3; first to 6 ends it', async () => {
    await lockLineups(c);
    expect(await err(c.h1.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Isak, p_player2: c.p.Hugo })))
      .toContain('doubles_not_open');

    for (const m of [1, 2, 3, 4, 5]) await winMatch(c.h1, c.enc, m, 'home');
    await winMatch(c.a1, c.enc, 6, 'away');
    let rows = await games(c);
    expect(rows[6].status).toBe('locked'); // doubles selected but not revealed yet
    expect(await encounter(c)).toMatchObject({ home_score: 5, away_score: 1 });

    expect(await err(c.h1.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Isak, p_player2: c.p.Isak })))
      .toContain('duplicate_player');
    // One confirmation is enough for doubles: the submitter's proposal locks the pair at once.
    const home = await c.h1.rpc<{ selection_id: string; version: number }>('propose_doubles', {
      p_encounter_id: c.enc, p_player1: c.p.Isak, p_player2: c.p.Hugo,
    });
    expect(home).toMatchObject({ version: 1, confirmed_count: 1, locked: true });
    expect(await c.h2.rpc('confirm_doubles', { p_selection_id: home.selection_id, p_version: 1 })).toMatchObject({ locked: true });
    // The opponent has not submitted yet, so the team may still change it: new version, still locked.
    const changed = await c.h2.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Isak, p_player2: c.p.Stefán });
    expect(changed).toMatchObject({ version: 2, confirmed_count: 1, locked: true });
    // Opponent cannot see the pair until both teams have submitted.
    expect(await c.a1.select('select * from public.doubles_players')).toHaveLength(0);
    expect((await games(c))[6].status).toBe('locked');

    await c.a1.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Karl, p_player2: c.p.Eiríkur });
    expect(await c.a1.select('select * from public.doubles_players')).toHaveLength(4);
    expect(await c.a1.select('select player_id from public.doubles_players dp join public.doubles_selections ds on ds.id = dp.doubles_selection_id where ds.side = $1 order by dp.position', ['home']))
      .toEqual([{ player_id: c.p.Isak }, { player_id: c.p.Stefán }]);
    // Both teams have submitted: players can no longer change either pair.
    expect(await err(c.h1.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Isak, p_player2: c.p.Hugo })))
      .toContain('doubles_locked');
    expect(await err(c.a2.rpc('propose_doubles', { p_encounter_id: c.enc, p_player1: c.p.Karl, p_player2: c.p.Lúkas })))
      .toContain('doubles_locked');
    rows = await games(c);
    expect(rows[6].status).toBe('available');
    expect(rows.slice(7).every((r) => r.status === 'locked')).toBe(true);

    await winMatch(c.a2, c.enc, 7, 'home'); // any participant may score any unlocked match
    rows = await games(c);
    expect(rows.slice(7).map((r) => r.status)).toEqual(['not_played', 'not_played', 'not_played']);
    expect(rows.slice(7).every((r) => r.winner === null)).toBe(true);
    expect(await encounter(c)).toMatchObject({ home_score: 6, away_score: 1, status: 'awaiting_confirmation' });
    expect(await err(score(c.h1, c.enc, 8, 1, 11, 5))).toContain('match_not_available');
  });

  it('5–5 after all ten matches is a draw', async () => {
    await lockLineups(c);
    for (const [m, w] of [[1, 'home'], [2, 'home'], [3, 'home'], [4, 'away'], [5, 'away'], [6, 'away']] as const) {
      await winMatch(c.h1, c.enc, m, w);
    }
    await lockDoubles(c);
    await winMatch(c.a1, c.enc, 7, 'home');
    await winMatch(c.a1, c.enc, 8, 'away');
    await winMatch(c.a1, c.enc, 9, 'home');
    await winMatch(c.a1, c.enc, 10, 'away');
    expect(await encounter(c)).toMatchObject({ home_score: 5, away_score: 5, status: 'awaiting_confirmation' });
    expect((await games(c)).every((g) => g.status === 'completed')).toBe(true);
  });

  it('result confirmation: one per team, bound to the result hash, invalidated by later changes, organizer reopen', async () => {
    await lockLineups(c);
    for (const m of [1, 2, 3, 4, 5, 6]) await winMatch(c.h1, c.enc, m, 'home');
    let e = await encounter(c);
    expect(e).toMatchObject({ home_score: 6, away_score: 0, status: 'awaiting_confirmation' });
    expect((await games(c))[6].status).toBe('not_played');

    expect(await err(c.h1.rpc('confirm_result', { p_encounter_id: c.enc, p_result_hash: 'stale' }))).toContain('result_changed');
    expect(await c.h1.rpc('confirm_result', { p_encounter_id: c.enc, p_result_hash: e.result_hash })).toBe('awaiting_confirmation');

    // A score change after the home confirmation invalidates it automatically.
    const hashBefore = e.result_hash;
    await score(c.a1, c.enc, 1, 1, 11, 6); // Karl disagrees on match 1 game 1
    e = await encounter(c);
    expect(e.status).toBe('in_progress');
    expect(e.home_score).toBe(5);
    await score(c.a1, c.enc, 1, 1, 11, 5); // back in agreement
    e = await encounter(c);
    expect(e.result_hash).toBe(hashBefore);
    // Same hash again -> the original confirmation is valid again (it vouched for exactly this result).
    await score(c.h1, c.enc, 1, 1, 11, 7);
    await score(c.a1, c.enc, 1, 1, 11, 7);
    e = await encounter(c);
    expect(e.result_hash).not.toBe(hashBefore);
    expect(e.result_version).toBeGreaterThan(1);

    expect(await c.a1.rpc('confirm_result', { p_encounter_id: c.enc, p_result_hash: e.result_hash })).toBe('awaiting_confirmation');
    expect(await c.h2.rpc('confirm_result', { p_encounter_id: c.enc, p_result_hash: e.result_hash })).toBe('completed');
    e = await encounter(c);
    expect(e.status).toBe('completed');
    expect(e.final_report).toMatchObject({ home_team: 'Víkingur-A', away_team: 'KR-B', home_score: 6, away_score: 0 });

    // Officially confirmed: players can no longer change anything.
    expect(await err(score(c.h1, c.enc, 1, 1, 11, 2))).toContain('encounter_confirmed');

    // Organizer reopens (audited) -> confirmations invalidated.
    expect(await err(c.h1.rpc('admin_reopen_encounter', { p_encounter_id: c.enc, p_reason: 'x' }))).toContain('forbidden');
    await c.t.as(c.org, () => c.t.query('select public.admin_reopen_encounter($1, $2)', [c.enc, 'Rangt skráð']));
    e = await encounter(c);
    expect(e.status).toBe('awaiting_confirmation');
    expect(e.final_report).toBeNull();
    const audit = await c.t.query("select * from public.audit_log where action = 'reopen_encounter'");
    expect(audit).toHaveLength(1);
  });

  it('organizer can unlock a lineup; scoring pauses until both lock again', async () => {
    await lockLineups(c);
    await winMatch(c.h1, c.enc, 1, 'home');
    const [lineup] = await c.t.query<{ id: string; version: number }>(
      "select id, version from public.lineups where encounter_id = $1 and side = 'home'",
      [c.enc],
    );
    await c.t.as(c.org, () => c.t.query('select public.admin_unlock_lineup($1, $2)', [lineup.id, 'Rangur leikmaður']));
    expect((await games(c)).slice(0, 6).every((g) => g.status === 'locked')).toBe(true);
    expect(await c.a1.select('select * from public.lineup_slots')).toHaveLength(3); // own only again
    // Re-submitting after the unlock locks it again straight away.
    const reproposed = await c.h1.rpc<{ locked: boolean }>('propose_lineup', {
      p_encounter_id: c.enc, p_slots: JSON.stringify({ A: c.p.Isak, B: c.p.Hugo, C: c.p.Daði }),
    });
    expect(reproposed.locked).toBe(true);
    const rows = await games(c);
    expect(rows[0]).toMatchObject({ status: 'completed', winner: 'home' }); // entries were kept
  });
});
