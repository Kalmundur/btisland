import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, DatabaseZap, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { classifyError, errorKey } from '../lib/errors';

/** Compact skeleton rows – small queries never blank the whole screen. */
export function LoadingState({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="skeleton" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton__row" />
      ))}
      <span className="visually-hidden">{t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state">
      {icon}
      <p className="state__text">{children}</p>
    </div>
  );
}

/** Human-readable error (never the raw database message) with an optional retry. */
export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const kind = classifyError(error);
  const Icon = kind === 'offline' || kind === 'network' ? WifiOff : AlertTriangle;
  return (
    <div className="state" role="alert">
      <Icon size={28} className="state__icon state__icon--danger" aria-hidden />
      <p className="state__text">{t(errorKey(error))}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function NotConfigured() {
  const { t } = useTranslation();
  return (
    <div className="state">
      <DatabaseZap size={28} className="state__icon" aria-hidden />
      <p className="state__text">
        <strong>{t('common.notConfiguredTitle')}</strong>
      </p>
      <p className="state__detail">{t('common.notConfiguredBody')}</p>
    </div>
  );
}

/** Standard loading / error / not-configured handling for an async block. */
export function AsyncBoundary<T>({
  state,
  children,
  rows,
}: {
  state: { data: T | undefined; error: unknown; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
  /** Skeleton size while loading. */
  rows?: number;
}) {
  if (state.error && state.data === undefined) {
    if (classifyError(state.error) === 'notConfigured') return <NotConfigured />;
    return <ErrorState error={state.error} onRetry={state.reload} />;
  }
  if (state.data === undefined) return <LoadingState rows={rows} />;
  return <>{children(state.data)}</>;
}
