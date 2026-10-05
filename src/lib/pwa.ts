/**
 * Service worker registration (app shell only – see vite.config.ts).
 * Not registered inside a native Capacitor shell, where the app is served locally anyway.
 */
import { registerSW } from 'virtual:pwa-register';
import { createStore } from './store';
import { isNative } from './platform';

/** Chrome/Android's install offer (not available on iOS Safari, which installs via Share). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Set while the browser offers installation; drives an optional Settings row. Never a popup. */
export const installPrompt = createStore<InstallPromptEvent | null>(null);

/** true when a new version has been downloaded and is waiting. */
export const updateAvailable = createStore(false);

let update: ((reload?: boolean) => Promise<void>) | null = null;

export function startServiceWorker(): void {
  if (typeof window === 'undefined' || isNative) return;
  // Keep the install offer for the Settings row instead of Chrome's automatic install bar.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt.set(e as InstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => installPrompt.set(null));
  if (!('serviceWorker' in navigator)) return;
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

/** Reloads onto the newest build: through the waiting service worker if there is one. */
export function reloadToLatest(): void {
  if (updateAvailable.get() && update) applyUpdate();
  else window.location.reload();
}

/** Opens the browser's install dialog (Android Chrome and other supporting browsers). */
export async function promptInstall(): Promise<void> {
  const e = installPrompt.get();
  if (!e) return;
  installPrompt.set(null); // the offer can only be used once
  await e.prompt();
}
