import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useOnline, useRealtimeHealthy } from '../lib/connectivity';
import { applyUpdate, updateAvailable } from '../lib/pwa';
import { useStore } from '../lib/store';

/**
 * Slim, only-when-relevant banner: offline (with what still works), delayed live updates,
 * and "new version ready". Hidden while everything is normal.
 */
export function ConnectivityBanner() {
  const { t } = useTranslation();
  const isOnline = useOnline();
  const realtimeOk = useRealtimeHealthy();
  const hasUpdate = useStore(updateAvailable);

  return (
    <div className="banners" aria-live="polite">
      {!isOnline && (
        <div className="banner banner--offline" role="status">
          <WifiOff size={16} aria-hidden />
          <span>
            <strong>{t('connection.offline')}.</strong> {t('connection.offlineHint')}
          </span>
        </div>
      )}
      {isOnline && !realtimeOk && (
        <div className="banner banner--muted" role="status">
          <RefreshCw size={16} aria-hidden />
          <span>{t('connection.realtime')}</span>
        </div>
      )}
      {hasUpdate && (
        <div className="banner banner--update">
          <span>{t('connection.updateAvailable')}</span>
          <button type="button" className="banner__action" onClick={applyUpdate}>
            {t('connection.updateApply')}
          </button>
        </div>
      )}
    </div>
  );
}
