/** IndexedDB-backed OutboxStore (survives reloads and app restarts; works in Capacitor webviews). */
import { memoryStore, type OutboxEntry, type OutboxStore } from './outbox';

const DB_NAME = 'btl-offline';
const STORE = 'score-outbox';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientEntryId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function indexedDbStore(): OutboxStore {
  if (typeof indexedDB === 'undefined') return memoryStore();
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= open());
  return {
    all: async () => tx<OutboxEntry[]>(await db(), 'readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>),
    put: async (entry) => {
      await tx(await db(), 'readwrite', (s) => s.put(entry));
    },
    delete: async (id) => {
      await tx(await db(), 'readwrite', (s) => s.delete(id));
    },
  };
}
