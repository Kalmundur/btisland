/**
 * Safe wrapper around localStorage (can throw in private mode / embedded webviews).
 *
 * The API stays synchronous everywhere (the Supabase session, the selected player and the
 * language read it at startup). Inside the native apps every write is mirrored to Capacitor
 * Preferences (UserDefaults / SharedPreferences), because iOS may clear WebView storage under
 * storage pressure; `restoreNativeStorage()` copies it back before the app renders.
 */
import { Preferences } from '@capacitor/preferences';
import { isNative } from './platform';

let markReady: () => void = () => undefined;
/** Resolves once native storage has been restored (immediately on the web). */
export const storageReady: Promise<void> = isNative ? new Promise((resolve) => (markReady = resolve)) : Promise.resolve();

const mirror = (fn: () => Promise<unknown>) => {
  if (isNative) void fn().catch(() => undefined);
};

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    mirror(() => Preferences.set({ key, value }));
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    mirror(() => Preferences.remove({ key }));
  },
};

/**
 * Native only, awaited once before the first render: native Preferences are the durable copy.
 * Values missing from localStorage (evicted) are restored; values only in localStorage
 * (written by an older build before mirroring existed) are copied into Preferences.
 */
export async function restoreNativeStorage(): Promise<void> {
  if (!isNative) return;
  try {
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      const { value } = await Preferences.get({ key });
      if (value !== null) window.localStorage.setItem(key, value);
    }
    const known = new Set(keys);
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      const value = key ? window.localStorage.getItem(key) : null;
      if (key && value !== null && !known.has(key)) await Preferences.set({ key, value });
    }
  } catch {
    /* storage unavailable: the app still works, the session is just not durable */
  } finally {
    markReady();
  }
}
