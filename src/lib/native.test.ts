import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate the native runtime: Capacitor reports iOS, Preferences is an in-memory store.
const prefs = new Map<string, string>();
const shared: Array<{ title?: string; url?: string }> = [];
vi.mock('./platform', () => ({ isNative: true, isWeb: false, isIOS: true, isAndroid: false, platform: 'ios' }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    keys: async () => ({ keys: [...prefs.keys()] }),
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
  },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: async (o: { title?: string; url?: string }) => void shared.push(o) },
}));

// Minimal browser globals for the node test environment.
const local = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
      key: (i: number) => [...local.keys()][i] ?? null,
      get length() {
        return local.size;
      },
    },
    location: { pathname: '/team/abc', search: '?x=1', href: 'https://localhost/team/abc?x=1' },
  },
});

const { storage, restoreNativeStorage, storageReady } = await import('./storage');
const { currentPageUrl, shareLink, PUBLIC_WEB_URL } = await import('./share');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('native storage', () => {
  beforeEach(() => {
    prefs.clear();
    local.clear();
  });

  it('mirrors writes and removals to native Preferences', async () => {
    storage.set('btl.playerId', 'p1');
    storage.set('sb-ref-auth-token', '{"session":1}');
    storage.remove('sb-ref-auth-token');
    await flush();
    expect([...prefs.entries()]).toEqual([['btl.playerId', 'p1']]);
  });

  it('restores values that WebView storage lost (session and player survive eviction)', async () => {
    prefs.set('btl.playerId', 'p1');
    prefs.set('sb-ref-auth-token', '{"session":1}');
    await restoreNativeStorage();
    expect(storage.get('btl.playerId')).toBe('p1');
    expect(storage.get('sb-ref-auth-token')).toBe('{"session":1}');
    await expect(storageReady).resolves.toBeUndefined();
  });

  it('copies values written before mirroring existed into Preferences', async () => {
    local.set('btl.language', 'en');
    await restoreNativeStorage();
    expect(prefs.get('btl.language')).toBe('en');
  });
});

describe('native share', () => {
  it('shares the public web address, not the local app origin', async () => {
    expect(currentPageUrl()).toBe(`${PUBLIC_WEB_URL}/team/abc?x=1`);
    expect(currentPageUrl().startsWith('https://localhost')).toBe(false);
    expect(await shareLink({ title: 'KR-A' })).toBe('shared');
    expect(shared.at(-1)).toMatchObject({ title: 'KR-A', url: `${PUBLIC_WEB_URL}/team/abc?x=1` });
  });
});
