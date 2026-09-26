import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/connectivity';
import { applyUpdate, updateAvailable } from '../lib/pwa';
import { useStore } from '../lib/store';

/**
 * Slim, only-when-relevant banner: offline (with what still works) and "new version ready".
 * Hidden while everything is normal. Delayed live updates are not shown: screens reconnect
 * and fall back to polling on their own.
 */
export function ConnectivityBanner() {
  const { t } = useTranslation();
  const isOnline = useOnline();
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
