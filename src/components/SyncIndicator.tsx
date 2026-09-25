import { useTranslation } from 'react-i18next';
import { Check, CloudOff, RefreshCw, X } from 'lucide-react';
import { scoreOutbox, useOutbox, useSyncStatus } from '../offline/scoreSync';

/** Compact sync pill – hidden while everything is normal. */
export function SyncIndicator() {
  const { t } = useTranslation();
  const { status, pending } = useSyncStatus();
  if (status === 'hidden') return null;
  const icon =
    status === 'synced' ? <Check size={14} aria-hidden /> : status === 'offline' ? <CloudOff size={14} aria-hidden /> : <RefreshCw size={14} aria-hidden />;
  const label =
    status === 'synced' ? t('sync.synced') : status === 'offline' ? t('sync.offline') : t('sync.unsynced', { count: pending });
  return (
    <button
      type="button"
      className={`sync-pill sync-pill--${status}`}
      onClick={() => void scoreOutbox.flush()}
      aria-live="polite"
    >
      {icon}
      {label}
    </button>
  );
}

/** Entries the server refused (e.g. the match was locked meanwhile). */
export function RejectedEntries() {
  const { t } = useTranslation();
  const { rejections } = useOutbox();
  if (rejections.length === 0) return null;
  return (
    <div className="banner banner--danger" role="alert">
      {rejections.map((r) => (
        <p key={r.entry.clientEntryId} className="banner__row">
          <span>
            {t('match.game', { number: r.entry.gameNumber })} · {t('match.title', { number: r.entry.matchNumber })}:{' '}
            {t('sync.rejected', { reason: t(`match.errors.${r.error}`, { defaultValue: t('match.errors.generic') }) })}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('sync.dismiss')}
            onClick={() => scoreOutbox.dismissRejection(r.entry.clientEntryId)}
          >
            <X size={16} aria-hidden />
          </button>
        </p>
      ))}
    </div>
  );
}
