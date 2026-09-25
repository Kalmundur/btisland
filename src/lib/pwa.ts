/**
 * Service worker registration (app shell only – see vite.config.ts).
 * Not registered inside a native Capacitor shell, where the app is served locally anyway.
 */
import { registerSW } from 'virtual:pwa-register';
import { createStore } from './store';

const isNativeShell = () =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** true when a new version has been downloaded and is waiting. */
export const updateAvailable = createStore(false);

let update: ((reload?: boolean) => Promise<void>) | null = null;

export function startServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isNativeShell()) return;
  update = registerSW({
    onNeedRefresh: () => updateAvailable.set(true),
    // Check for a new version hourly for long-open sessions (e.g. a scorer's phone).
    onRegisteredSW: (_url, registration) => {
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}

/** Activates the waiting version and reloads. Unsynced scores are safe in IndexedDB. */
export function applyUpdate(): void {
  void update?.(true);
}
