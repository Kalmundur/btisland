/** Browser connectivity + realtime channel health, shared by banners and sync indicators. */
import { createStore, useStore } from './store';

export const online = createStore(typeof navigator === 'undefined' ? true : navigator.onLine);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => online.set(true));
  window.addEventListener('offline', () => online.set(false));
}

export function useOnline(): boolean {
  return useStore(online);
}

// Realtime: names of channels that are currently not subscribed (error/timeout).
const unhealthy = new Set<string>();
export const realtimeHealthy = createStore(true);

export function reportChannel(name: string, healthy: boolean | null): void {
  if (healthy === false) unhealthy.add(name);
  else unhealthy.delete(name); // true, or null = channel removed
  realtimeHealthy.set(unhealthy.size === 0);
}

export function useRealtimeHealthy(): boolean {
  return useStore(realtimeHealthy);
}
