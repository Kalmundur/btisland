import { describe, expect, it } from 'vitest';
import { memoryStore, Outbox, type OutboxEntry, type SendResult } from './outbox';

let seq = 0;
const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
  clientEntryId: `c${++seq}`,
  encounterId: 'e',
  matchNumber: 1,
  gameNumber: 1,
  homePoints: 11,
  awayPoints: 5,
  queuedAt: seq,
  ...over,
});

/** Fake server: idempotent by clientEntryId, like submit_game_score. */
function fakeServer() {
  const applied = new Map<string, OutboxEntry>();
  let online = true;
  let reject: string | null = null;
  const calls: string[] = [];
  const send = async (e: OutboxEntry): Promise<SendResult> => {
    calls.push(e.clientEntryId);
    if (!online) return { ok: false, retryable: true, error: 'Failed to fetch' };
    if (reject) return { ok: false, retryable: false, error: reject };
    applied.set(e.clientEntryId, e);
    return { ok: true };
  };
  return {
    send,
    applied,
    calls,
    setOnline: (v: boolean) => (online = v),
    setReject: (v: string | null) => (reject = v),
  };
}

describe('score outbox', () => {
  it('sends and removes acknowledged entries', async () => {
    const server = fakeServer();
    const outbox = new Outbox(memoryStore(), server.send);
    await outbox.enqueue(entry());
    expect(server.applied.size).toBe(1);
    expect(outbox.getSnapshot()).toMatchObject({ pending: [], offline: false, syncedCount: 1 });
  });

  it('keeps entries while offline ("Ósamstillt") and never pretends they were accepted', async () => {
    const server = fakeServer();
    server.setOnline(false);
    const store = memoryStore();
    const outbox = new Outbox(store, server.send);
    await outbox.enqueue(entry({ gameNumber: 1 }));
    await outbox.enqueue(entry({ gameNumber: 2 }));
    expect(outbox.getSnapshot().pending).toHaveLength(2);
    expect(outbox.getSnapshot().offline).toBe(true);
    expect(server.applied.size).toBe(0);
    expect(await store.all()).toHaveLength(2); // durable

    server.setOnline(true);
    await outbox.flush();
    expect(outbox.getSnapshot()).toMatchObject({ pending: [], offline: false });
    expect([...server.applied.values()].map((e) => e.gameNumber)).toEqual([1, 2]); // FIFO
  });

  it('survives a restart: a new outbox over the same store picks up queued entries', async () => {
    const server = fakeServer();
    server.setOnline(false);
    const store = memoryStore();
    await new Outbox(store, server.send).enqueue(entry());
    server.setOnline(true);
    const restarted = new Outbox(store, server.send);
    await restarted.flush();
    expect(server.applied.size).toBe(1);
    expect(await store.all()).toHaveLength(0);
  });

  it('retrying after a lost acknowledgement re-sends the same client id (server dedupes)', async () => {
    const server = fakeServer();
    let first = true;
    const flaky = async (e: OutboxEntry): Promise<SendResult> => {
      const r = await server.send(e);
      if (first) {
        first = false;
        throw new Error('network dropped after server applied it');
      }
      return r;
    };
    const outbox = new Outbox(memoryStore(), flaky);
    const e = entry();
    await outbox.enqueue(e);
    expect(outbox.getSnapshot().pending).toHaveLength(1);
    await outbox.flush();
    expect(server.calls).toEqual([e.clientEntryId, e.clientEntryId]);
    expect(server.applied.size).toBe(1);
    expect(outbox.getSnapshot().pending).toHaveLength(0);
  });

  it('a newer entry for the same game supersedes a queued older one', async () => {
    const server = fakeServer();
    server.setOnline(false);
    const outbox = new Outbox(memoryStore(), server.send);
    await outbox.enqueue(entry({ homePoints: 11, awayPoints: 8 }));
    await outbox.enqueue(entry({ homePoints: 11, awayPoints: 9 }));
    expect(outbox.getSnapshot().pending.map((p) => p.awayPoints)).toEqual([9]);
  });

  it('drops server-rejected entries and reports them', async () => {
    const server = fakeServer();
    server.setReject('match_not_available');
    const outbox = new Outbox(memoryStore(), server.send);
    const e = entry();
    await outbox.enqueue(e);
    expect(outbox.getSnapshot().pending).toHaveLength(0);
    expect(outbox.getSnapshot().rejections).toEqual([{ entry: e, error: 'match_not_available' }]);
    outbox.dismissRejection(e.clientEntryId);
    expect(outbox.getSnapshot().rejections).toHaveLength(0);
  });

  it('concurrent flushes share one pass (no duplicate sends)', async () => {
    const server = fakeServer();
    server.setOnline(false);
    const outbox = new Outbox(memoryStore(), server.send);
    await outbox.enqueue(entry());
    server.setOnline(true);
    server.calls.length = 0;
    await Promise.all([outbox.flush(), outbox.flush(), outbox.flush()]);
    expect(server.calls).toHaveLength(1);
  });
});
