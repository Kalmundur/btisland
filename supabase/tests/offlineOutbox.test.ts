/**
 * Offline score outbox against the real database (submit_game_score + reconciliation).
 * A "network" flag decides whether sends reach the server, simulating lost connectivity.
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, Outbox, type OutboxEntry, type SendResult } from '../../src/offline/outbox.ts';
import { createTestDb, joinDevice, type Device, type TestDb } from './harness.ts';

let t: TestDb;
let enc: string;
let karl: Device;
let ellert: Device;
let online: boolean;
let dropAckOnce: boolean;

/** Like scoreSync.send: connectivity failure = retryable; anything the database raises = final. */
function sender(device: Device) {
  return async (e: OutboxEntry): Promise<SendResult> => {
    if (!online) return { ok: false, retryable: true, error: 'Failed to fetch' };
    try {
      await device.rpc('submit_game_score', {
        p_client_entry_id: e.clientEntryId,
        p_encounter_id: e.encounterId,
        p_match_number: e.matchNumber,
        p_game_number: e.gameNumber,
        p_home_points: e.homePoints,
        p_away_points: e.awayPoints,
      });
    } catch (err) {
      return { ok: false, retryable: false, error: (err as Error).message };
    }
    if (dropAckOnce) {
      dropAckOnce = false;
      throw new TypeError('Failed to fetch'); // applied on the server, response lost
    }
    return { ok: true };
  };
}

const entry = (game: number, home: number, away: number, match = 1): OutboxEntry => ({
  clientEntryId: randomUUID(),
  encounterId: enc,
  matchNumber: match,
  gameNumber: game,
  homePoints: home,
  awayPoints: away,
  queuedAt: Date.now() + game,
});
const reconciled = (game: number) =>
  t.query<{ status: string; home_points: number | null; away_points: number | null }>(
    'select status, home_points, away_points from public.reconciled_set_states where encounter_id = $1 and match_number = 1 and game_number = $2',
    [enc, game],
  ).then((r) => r[0]);
const entries = () => t.query<{ n: number }>('select count(*)::int as n from public.set_entries where encounter_id = $1', [enc]).then((r) => r[0].n);

describe('offline score outbox (database)', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    online = true;
    dropAckOnce = false;
    t = await createTestDb();
    const isak = await joinDevice(t, 'Isak Alfredsson', '482913');
    const stefan = await joinDevice(t, 'Stefán Birkisson', '482913');
    karl = await joinDevice(t, 'Karl Claesson', '482913');
    ellert = await joinDevice(t, 'Ellert Georgsson', '482913');
    enc = (await t.query<{ encounter_id: string }>('select encounter_id from public.round_sessions where auth_user_id = $1', [karl.userId]))[0].encounter_id;
    const pid = (n: string) => t.playerId(n);
    const h = await isak.rpc<{ lineup_id: string; version: number }>('propose_lineup', {
      p_encounter_id: enc, p_slots: JSON.stringify({ A: await pid('Isak Alfredsson'), B: await pid('Stefán Birkisson'), C: await pid('Daði Guðmundsson') }),
    });
    await stefan.rpc('confirm_lineup', { p_lineup_id: h.lineup_id, p_version: h.version });
    const a = await karl.rpc<{ lineup_id: string; version: number }>('propose_lineup', {
      p_encounter_id: enc, p_slots: JSON.stringify({ X: await pid('Karl Claesson'), Y: await pid('Ellert Georgsson'), Z: await pid('Eiríkur Gunnarsson') }),
    });
    await ellert.rpc('confirm_lineup', { p_lineup_id: a.lineup_id, p_version: a.version });
  });

  it('1. online: the entry syncs and reconciles', async () => {
    const outbox = new Outbox(memoryStore(), sender(karl));
    await outbox.enqueue(entry(1, 11, 7));
    expect(outbox.getSnapshot()).toMatchObject({ pending: [], offline: false, syncedCount: 1 });
    expect(await reconciled(1)).toEqual({ status: 'agreed', home_points: 11, away_points: 7 });
  });

  it('2–5. offline: stays queued ("Ósamstillt"), nothing reaches the server, then syncs on reconnect', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, sender(karl));
    online = false;
    await outbox.enqueue(entry(1, 11, 7));
    await outbox.enqueue(entry(2, 9, 11));
    expect(outbox.getSnapshot().pending).toHaveLength(2); // shown as unsynced in the UI
    expect(outbox.getSnapshot().offline).toBe(true);
    expect(await entries()).toBe(0); // never pretended to be accepted
    expect(await reconciled(1)).toBeUndefined(); // nothing "official" while unsynced
    expect(await store.all()).toHaveLength(2); // durable

    online = true;
    await outbox.flush();
    expect(outbox.getSnapshot()).toMatchObject({ pending: [], offline: false });
    expect(await entries()).toBe(2);
    expect(await reconciled(2)).toEqual({ status: 'agreed', home_points: 9, away_points: 11 });
  });

  it('6. a retry after a lost acknowledgement does not duplicate the entry', async () => {
    const outbox = new Outbox(memoryStore(), sender(karl));
    dropAckOnce = true;
    await outbox.enqueue(entry(1, 11, 7));
    expect(outbox.getSnapshot().pending).toHaveLength(1); // not acknowledged -> still queued
    expect(await entries()).toBe(1); // but the server has it
    await outbox.flush();
    expect(outbox.getSnapshot().pending).toHaveLength(0);
    expect(await entries()).toBe(1);
  });

  it('7. a conflict created while offline is surfaced after reconnect', async () => {
    const outbox = new Outbox(memoryStore(), sender(karl));
    online = false;
    await outbox.enqueue(entry(1, 11, 7));
    // Meanwhile Ellert (online, another phone) enters a different score for the same game.
    await ellert.rpc('submit_game_score', {
      p_client_entry_id: randomUUID(), p_encounter_id: enc, p_match_number: 1, p_game_number: 1, p_home_points: 11, p_away_points: 8,
    });
    expect(await reconciled(1)).toEqual({ status: 'agreed', home_points: 11, away_points: 8 });
    online = true;
    await outbox.flush();
    expect(await reconciled(1)).toEqual({ status: 'conflict', home_points: null, away_points: null });
  });

  it('a score the server refuses after reconnect is reported, never dropped silently', async () => {
    const outbox = new Outbox(memoryStore(), sender(karl));
    online = false;
    await outbox.enqueue(entry(1, 11, 7));
    await t.query("update public.encounters set status = 'completed' where id = $1", [enc]); // confirmed meanwhile
    online = true;
    await outbox.flush();
    const snap = outbox.getSnapshot();
    expect(snap.pending).toHaveLength(0);
    expect(snap.rejections).toHaveLength(1);
    expect(snap.rejections[0].error).toContain('encounter_confirmed');
    expect(snap.rejections[0].entry).toMatchObject({ homePoints: 11, awayPoints: 7 });
  });
});
