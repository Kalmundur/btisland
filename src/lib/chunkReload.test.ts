import { describe, expect, it } from 'vitest';
import { claimAutoReload, isChunkLoadError } from './chunkReload';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('stale chunk recovery', () => {
  it('recognises failed lazy imports in each browser', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/AdminApp-CH7gQEWX.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/AdminApp.css'))).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('reloads once, not in a loop', () => {
    const storage = memoryStorage();
    expect(claimAutoReload(storage, 1_000)).toBe(true);
    expect(claimAutoReload(storage, 5_000)).toBe(false);
    expect(claimAutoReload(storage, 40_000)).toBe(true);
  });

  it('never auto-reloads without storage to guard it', () => {
    expect(claimAutoReload(null)).toBe(false);
  });
});
