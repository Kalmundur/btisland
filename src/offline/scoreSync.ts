/**
 * App-wide score outbox: IndexedDB-backed, retried on reconnect, on an interval and at startup.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useOnline } from '../lib/connectivity';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { submitGameScore } from '../data/encounterRepository';
import { indexedDbStore } from './idbStore';
import { Outbox, type OutboxEntry, type OutboxSnapshot, type SendResult } from './outbox';

const RETRY_INTERVAL_MS = 15_000;

async function send(entry: OutboxEntry): Promise<SendResult> {
  // Without a restored auth session the server would answer "not_in_encounter":
  // keep the entry instead of letting it be rejected.
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session) return { ok: false, retryable: true, error: 'no_session' };
  return submitGameScore(entry);
}

export const scoreOutbox = new Outbox(indexedDbStore(), send);

if (typeof window !== 'undefined' && isSupabaseConfigured) {
  window.addEventListener('online', () => void scoreOutbox.flush());
  window.setInterval(() => {
    if (scoreOutbox.getSnapshot().pending.length > 0) void scoreOutbox.flush();
  }, RETRY_INTERVAL_MS);
  void scoreOutbox.flush();
}

export function newClientEntryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback for older webviews
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useOutbox(): OutboxSnapshot {
  return useSyncExternalStore(scoreOutbox.subscribe, scoreOutbox.getSnapshot);
}

export type SyncStatus = 'hidden' | 'synced' | 'unsynced' | 'offline';

/** Compact indicator state: only visible when something is not normal (or just recovered). */
export function useSyncStatus(): { status: SyncStatus; pending: number } {
  const snapshot = useOutbox();
  const online = useOnline();
  const [justSynced, setJustSynced] = useState(false);
  const lastCount = useRef(snapshot.syncedCount);
  const hadPending = useRef(false);

  useEffect(() => {
    if (snapshot.pending.length > 0) hadPending.current = true;
    if (snapshot.syncedCount > lastCount.current && snapshot.pending.length === 0 && hadPending.current) {
      hadPending.current = false;
      setJustSynced(true);
      const t = setTimeout(() => setJustSynced(false), 2500);
      lastCount.current = snapshot.syncedCount;
      return () => clearTimeout(t);
    }
    lastCount.current = snapshot.syncedCount;
  }, [snapshot.syncedCount, snapshot.pending.length]);

  const pending = snapshot.pending.length;
  if (!online) return { status: 'offline', pending };
  if (pending > 0) return { status: 'unsynced', pending };
  if (justSynced) return { status: 'synced', pending };
  return { status: 'hidden', pending };
}
