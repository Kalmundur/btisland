/**
 * Organizer corrections, postponement and competition formats (database level).
 * Round 4 (dev code 482913): Víkingur-A (home) vs KR-B (away).
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, joinDevice, type Device, type TestDb } from './harness.ts';

const CODE = '482913';

let t: TestDb;
let enc: string;
let h1: Device;
let h2: Device;
let a1: Device;
let a2: Device;
let org: string;

const score = (d: Device, match: number, game: number, home: number, away: number) =>
  d.rpc('submit_game_score', {
    p_client_entry_id: randomUUID(), p_encounter_id: enc, p_match_number: match, p_game_number: game, p_home_points: home, p_away_points: away,
  });
const win = async (d: Device, match: number, w: 'home' | 'away') => {
  for (let g = 1; g <= 3; g++) await score(d, match, g, w === 'home' ? 11 : 4, w === 'home' ? 4 : 11);
};
const asOrg = (sql: string, params: unknown[]) => t.as(org, () => t.query(sql, params));
const encounter = async () =>
  (await t.query<{ status: string; home_score: number; away_score: number; result_hash: string; result_version: number }>(
    'select status, home_score, away_score, result_hash, result_version from public.encounters where id = $1', [enc],
  ))[0];
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (e) {
    return (e as Error).message;
  }
};

async function lockLineups() {
  const id = (n: string) => t.playerId(n);
  const home = await h1.rpc<{ lineup_id: string; version: number }>('propose_lineup', {
    p_encounter_id: enc, p_slots: JSON.stringify({ A: await id('Isak Alfredsson'), B: await id('Stefán Birkisson'), C: await id('Daði Guðmundsson') }),
  });
  await h2.rpc('confirm_lineup', { p_lineup_id: home.lineup_id, p_version: home.version });
  const away = await a1.rpc<{ lineup_id: string; version: number }>('propose_lineup', {
    p_encounter_id: enc, p_slots: JSON.stringify({ X: await id('Karl Claesson'), Y: await id('Ellert Georgsson'), Z: await id('Eiríkur Gunnarsson') }),
  });
  await a2.rpc('confirm_lineup', { p_lineup_id: away.lineup_id, p_version: away.version });
}

describe('league administration (database)', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    t = await createTestDb();
    h1 = await joinDevice(t, 'Isak Alfredsson', CODE);
    h2 = await joinDevice(t, 'Stefán Birkisson', CODE);
    a1 = await joinDevice(t, 'Karl Claesson', CODE);
    a2 = await joinDevice(t, 'Ellert Georgsson', CODE);
    enc = (await t.query<{ encounter_id: string }>('select encounter_id from public.round_sessions where auth_user_id = $1', [h1.userId]))[0].encounter_id;
    org = await t.createUser();
    await t.query('insert into public.organizers (user_id) values ($1)', [org]);
  });

  it('divisions reference the regular ten-match format', async () => {
    const rows = await t.query<{ format_key: string }>('select format_key from public.divisions');
    expect(rows.every((r) => r.format_key === 'REGULAR_TEN_MATCH')).toBe(true);
    const formats = await t.as(null, () => t.query<{ key: string; wins_to_take: number }>('select key, wins_to_take from public.competition_formats'));
    expect(formats).toEqual([{ key: 'REGULAR_TEN_MATCH', wins_to_take: 6 }]);
  });

  it('an organizer correction resolves a conflict, keeps raw entries and is audited', async () => {
    await lockLineups();
    await score(h1, 1, 1, 11, 8);
    await score(a1, 1, 1, 11, 9);
    expect((await t.query<{ status: string }>('select status from public.reconciled_set_states where encounter_id = $1', [enc]))[0].status).toBe('conflict');

    expect(await err(h1.rpc('admin_correct_game', { p_encounter_id: enc, p_match_number: 1, p_game_number: 1, p_home_points: 11, p_away_points: 8 })))
      .toContain('forbidden');
    expect(await err(asOrg('select public.admin_correct_game($1, 1, 1, 11, 10, $2)', [enc, 'x']))).toContain('invalid_game_score');

    await asOrg('select public.admin_correct_game($1, 1, 1, 11, 8, $2)', [enc, 'Dómari staðfesti 11–8']);
    const rec = await t.as(null, () =>
      t.query('select status, home_points, away_points, corrected from public.reconciled_set_states where encounter_id = $1', [enc]),
    );
    expect(rec).toEqual([{ status: 'agreed', home_points: 11, away_points: 8, corrected: true }]);
    expect(await t.query('select * from public.set_entries where encounter_id = $1', [enc])).toHaveLength(2);

    const [audit] = await t.query<{ details: { before: { status: string }; after: { home: number }; reason: string } ; actor_user_id: string }>(
      "select actor_user_id, details from public.audit_log where action = 'correct_game'",
    );
    expect(audit.actor_user_id).toBe(org);
    expect(audit.details).toMatchObject({ before: { status: 'conflict' }, after: { home: 11 }, reason: 'Dómari staðfesti 11–8' });

    // Players cannot read corrections directly; clearing restores the conflict.
    expect(await h1.select('select * from public.game_corrections')).toHaveLength(0);
    await asOrg('select public.admin_clear_correction($1, 1, 1, $2)', [enc, 'rangt']);
    expect((await t.query<{ status: string }>('select status from public.reconciled_set_states where encounter_id = $1', [enc]))[0].status).toBe('conflict');
  });

  it('correcting an officially confirmed result bumps the version, invalidates confirmations and re-derives the score', async () => {
    await lockLineups();
    for (const m of [1, 2, 3, 4, 5]) await win(h1, m, 'home');
    await win(h1, 6, 'away');
    // 5–1: doubles
    const pid = (n: string) => t.playerId(n);
    const hd = await h1.rpc<{ selection_id: string; version: number }>('propose_doubles', { p_encounter_id: enc, p_player1: await pid('Isak Alfredsson'), p_player2: await pid('Hugo Nylen') });
    await h2.rpc('confirm_doubles', { p_selection_id: hd.selection_id, p_version: hd.version });
    const ad = await a1.rpc<{ selection_id: string; version: number }>('propose_doubles', { p_encounter_id: enc, p_player1: await pid('Karl Claesson'), p_player2: await pid('Lúkas Ólason') });
    await a2.rpc('confirm_doubles', { p_selection_id: ad.selection_id, p_version: ad.version });
    await win(h1, 7, 'home');
    let e = await encounter();
    expect(e).toMatchObject({ home_score: 6, away_score: 1, status: 'awaiting_confirmation' });
    await h1.rpc('confirm_result', { p_encounter_id: enc, p_result_hash: e.result_hash });
    await a1.rpc('confirm_result', { p_encounter_id: enc, p_result_hash: e.result_hash });
    e = await encounter();
    expect(e.status).toBe('completed');
    const versionBefore = e.result_version;

    // Organizer corrects match 1: games 1–3 become away wins -> 5–2, no longer decided.
    for (const g of [1, 2, 3]) await asOrg(`select public.admin_correct_game($1, 1, ${g}, 4, 11, $2)`, [enc, 'leiðrétting']);
    e = await encounter();
    expect(e).toMatchObject({ home_score: 5, away_score: 2, status: 'in_progress' });
    expect(e.result_version).toBeGreaterThan(versionBefore);
    const valid = await t.query('select * from public.result_confirmations where encounter_id = $1 and result_hash = $2', [enc, e.result_hash]);
    expect(valid).toHaveLength(0);
    const games = await t.query<{ match_number: number; status: string }>(
      'select match_number, status from public.encounter_games where encounter_id = $1 and match_number >= 8 order by match_number', [enc],
    );
    expect(games.map((g) => g.status)).toEqual(['available', 'available', 'available']);
  });

  it('postponed encounters stay postponed through recomputation and are closed for players', async () => {
    expect(await err(h1.rpc('admin_set_encounter_status', { p_encounter_id: enc, p_status: 'postponed' }))).toContain('forbidden');
    const [{ s }] = await asOrg("select public.admin_set_encounter_status($1, 'postponed', $2) as s", [enc, 'Veður']);
    expect(s).toBe('postponed');

    const pid = (n: string) => t.playerId(n);
    expect(await err(h1.rpc('propose_lineup', {
      p_encounter_id: enc, p_slots: JSON.stringify({ A: await pid('Isak Alfredsson'), B: await pid('Stefán Birkisson'), C: await pid('Daði Guðmundsson') }),
    }))).toContain('encounter_closed');
    await t.query('select public.recompute_encounter($1)', [enc]);
    expect((await encounter()).status).toBe('postponed');

    const [{ r }] = await asOrg("select public.admin_set_encounter_status($1, 'active', null) as r", [enc]);
    expect(r).toBe('scheduled');
    const audit = await t.query<{ details: { before: string; after: string } }>("select details from public.audit_log where action = 'set_status' order by id");
    expect(audit.map((a) => [a.details.before, a.details.after])).toEqual([['scheduled', 'postponed'], ['postponed', 'scheduled']]);
  });
});
