/**
 * After a deploy, a page loaded from the previous build can ask for a lazy chunk
 * (e.g. AdminApp-<oldhash>.js) that no longer exists. index.html is never cached, so
 * reloading once picks up the new build. The guard stops a reload loop if the chunk is
 * genuinely unreachable (offline, broken deploy) – then the error screen is shown.
 */
const RELOAD_KEY = 'chunk-reload-at';
const RELOAD_WINDOW_MS = 30_000;

/** Browser messages for a failed dynamic import / Vite preload. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i.test(
    message,
  );
}

interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** true (and records it) unless an automatic reload already happened moments ago. */
export function claimAutoReload(storage: KeyValue | null = safeSessionStorage(), now = Date.now()): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function safeSessionStorage(): KeyValue | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
