import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { isChunkLoadError } from '../lib/chunkReload';
import { reloadToLatest } from '../lib/pwa';

/**
 * Router error screen (replaces React Router's developer page). A stale chunk after a
 * deploy gets a "new version" message; anything else a generic error. Both offer a reload.
 */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const stale = isChunkLoadError(error);
  if (!stale) console.error(error);
  const Icon = stale ? RefreshCw : AlertTriangle;

  return (
    <main className="state state--page" role="alert">
      <Icon size={28} className={`state__icon${stale ? '' : ' state__icon--danger'}`} aria-hidden />
      <p className="state__text">
        <strong>{stale ? t('errors.newVersionTitle') : t('errors.generic')}</strong>
      </p>
      {stale && <p className="state__detail">{t('errors.newVersionBody')}</p>}
      <Button variant="primary" size="sm" onClick={reloadToLatest}>
        {t('errors.reload')}
      </Button>
      <a href="/scorecard" className="accent">
        {t('errors.goHome')}
      </a>
    </main>
  );
}
