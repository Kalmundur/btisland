/**
 * Native-shell behaviour (iOS / Android). Everything platform-specific at app level lives
 * here; the web app never runs any of it.
 */
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isAndroid, isNative } from './platform';

/** A modal (dialog, sheet, drawer) is open – they all close on Escape (see useDialog). */
function closeOpenModal(): boolean {
  if (!document.querySelector('[aria-modal="true"]')) return false;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

export function startNativeShell(options: { onResume?: () => void } = {}): void {
  if (!isNative) return;

  // Light UI: dark status-bar text/icons.
  void SystemBars.setStyle({ style: SystemBarsStyle.Light }).catch(() => undefined);

  // Coming back to the foreground (screen unlocked, app switched back): let the app catch up.
  // Realtime reconnects on its own (visibilitychange); this is for queued offline scores.
  void App.addListener('resume', () => options.onResume?.());

  // Android system back: close an open modal first, then follow in-app history, and at the
  // start of history leave the app in the background instead of looping.
  if (isAndroid) {
    void App.addListener('backButton', ({ canGoBack }) => {
      if (closeOpenModal()) return;
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });
  }
}
