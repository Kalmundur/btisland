import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyStoredLanguage } from './i18n';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/scoring.css';
import './styles/league.css';
import { App } from './App';
import { reloadToLatest, startServiceWorker } from './lib/pwa';
import { claimAutoReload } from './lib/chunkReload';
import { restoreNativeStorage } from './lib/storage';
import { startNativeShell } from './lib/native';
import { scoreOutbox } from './offline/scoreSync';

startServiceWorker();
// Vite's own signal that a (CSS/JS) preload of an old build failed: same one-time reload.
window.addEventListener('vite:preloadError', (event) => {
  if (!claimAutoReload()) return;
  event.preventDefault();
  reloadToLatest();
});
startNativeShell({ onResume: () => void scoreOutbox.flush() });

// Native apps restore the durable copy of the session/player choice first (no-op on the web).
void restoreNativeStorage().finally(() => {
  applyStoredLanguage();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
