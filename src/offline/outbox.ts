/**
 * Small durable outbox for game-score entries.
 *
 * - Every entry is written to the store BEFORE it is sent.
 * - Entries are sent one at a time in FIFO order; a retryable (network) failure stops the
 *   flush and leaves everything queued.
 * - Each entry carries an idempotent clientEntryId, so re-sending after a lost ack is safe.
 * - An entry is removed only after the server acknowledged it (or rejected it outright).
 */
import type { UUID } from '../domain/types';

export interface OutboxEntry {
  clientEntryId: UUID;
  encounterId: UUID;
  matchNumber: number;
  gameNumber: number;
  homePoints: number;
  awayPoints: number;
  /** ms since epoch; FIFO key */
  queuedAt: number;
}

export interface OutboxStore {
  all(): Promise<OutboxEntry[]>;
  put(entry: OutboxEntry): Promise<void>;
  delete(clientEntryId: UUID): Promise<void>;
}

export type SendResult =
  | { ok: true }
  /** retryable: connectivity problem – keep and retry later. Otherwise the server refused it. */
  | { ok: false; retryable: boolean; error: string };

export interface Rejection {
  entry: OutboxEntry;
  error: string;
}

export interface OutboxSnapshot {
  pending: OutboxEntry[];
  /** Last flush hit a connectivity error. */
  offline: boolean;
  flushing: boolean;
  rejections: Rejection[];
  /** Incremented every time entries were acknowledged (lets UIs briefly show "synced"). */
  syncedCount: number;
}

const sameGame = (a: OutboxEntry, b: OutboxEntry) =>
  a.encounterId === b.encounterId && a.matchNumber === b.matchNumber && a.gameNumber === b.gameNumber;

export class Outbox {
  private snapshot: OutboxSnapshot = { pending: [], offline: false, flushing: false, rejections: [], syncedCount: 0 };
  private listeners = new Set<() => void>();
  private flushPromise: Promise<void> | null = null;
  private loaded: Promise<void>;

  constructor(
    private readonly store: OutboxStore,
    private readonly send: (entry: OutboxEntry) => Promise<SendResult>,
  ) {
    this.loaded = this.reload();
  }

  getSnapshot = (): OutboxSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<OutboxSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  private async reload() {
    const all = await this.store.all();
    this.set({ pending: all.sort((a, b) => a.queuedAt - b.queuedAt) });
  }

  /** Persist first, then try to send. Supersedes older queued entries for the same game. */
  async enqueue(entry: OutboxEntry): Promise<void> {
    await this.loaded;
    for (const old of this.snapshot.pending) {
      if (sameGame(old, entry)) await this.store.delete(old.clientEntryId);
    }
    await this.store.put(entry);
    await this.reload();
    await this.flush();
  }

  dismissRejection(clientEntryId: UUID) {
    this.set({ rejections: this.snapshot.rejections.filter((r) => r.entry.clientEntryId !== clientEntryId) });
  }

  /** Single-flight: concurrent callers share the same flush. */
  flush(): Promise<void> {
    if (!this.flushPromise) {
      this.flushPromise = this.doFlush().finally(() => {
        this.flushPromise = null;
      });
    }
    return this.flushPromise;
  }

  private async doFlush() {
    await this.loaded;
    await this.reload();
    if (this.snapshot.pending.length === 0) {
      if (this.snapshot.offline) this.set({ offline: false });
      return;
    }
    this.set({ flushing: true });
    let synced = 0;
    try {
      for (const entry of this.snapshot.pending) {
        let result: SendResult;
        try {
          result = await this.send(entry);
        } catch (e) {
          result = { ok: false, retryable: true, error: e instanceof Error ? e.message : String(e) };
        }
        if (result.ok) {
          await this.store.delete(entry.clientEntryId);
          synced++;
        } else if (result.retryable) {
          this.set({ offline: true });
          return;
        } else {
          await this.store.delete(entry.clientEntryId);
          this.set({ rejections: [...this.snapshot.rejections, { entry, error: result.error }] });
        }
      }
      this.set({ offline: false });
    } finally {
      await this.reload();
      this.set({ flushing: false, syncedCount: this.snapshot.syncedCount + synced });
    }
  }
}

/** Volatile store – used in tests and as a fallback when IndexedDB is unavailable. */
export function memoryStore(initial: OutboxEntry[] = []): OutboxStore {
  const map = new Map(initial.map((e) => [e.clientEntryId, e]));
  return {
    all: async () => [...map.values()],
    put: async (e) => {
      map.set(e.clientEntryId, e);
    },
    delete: async (id) => {
      map.delete(id);
    },
  };
}
