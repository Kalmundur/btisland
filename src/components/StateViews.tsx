import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, DatabaseZap } from 'lucide-react';
import { Button } from './Button';

export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
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

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const detail = error instanceof Error ? error.message : null;
  return (
    <div className="state" role="alert">
      <AlertTriangle size={28} className="state__icon state__icon--danger" aria-hidden />
      <p className="state__text">{t('common.error')}</p>
      {detail && <p className="state__detail">{detail}</p>}
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
}: {
  state: { data: T | undefined; error: unknown; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
}) {
  if (state.error && state.data === undefined) {
    if (state.error instanceof Error && state.error.name === 'SupabaseNotConfiguredError') return <NotConfigured />;
    return <ErrorState error={state.error} onRetry={state.reload} />;
  }
  if (state.data === undefined) return <LoadingState />;
  return <>{children(state.data)}</>;
}
