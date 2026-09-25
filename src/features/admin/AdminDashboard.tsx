import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAsync } from '../../hooks/useAsync';
import { countRows } from '../../data/adminRepository';
import { AsyncBoundary } from '../../components/StateViews';
import { RESOURCES } from './resources';

export function AdminDashboard() {
  const { t } = useTranslation();
  const counts = useAsync(
    async () => Object.fromEntries(await Promise.all(RESOURCES.map(async (r) => [r.key, await countRows(r.table)] as const))),
    [],
  );

  return (
    <div className="admin-page">
      <div className="admin-page__head">
        <div>
          <h1 className="admin-page__title">{t('admin.nav.dashboard')}</h1>
          <p className="muted">{t('admin.dashboard.intro')}</p>
        </div>
      </div>
      <AsyncBoundary state={counts}>
        {(c) => (
          <div className="stat-grid">
            {RESOURCES.map((r) => (
              <Link key={r.key} to={`/admin/${r.key}`} className="stat">
                <r.icon size={18} className="stat__icon" aria-hidden />
                <span className="stat__value num">{c[r.key]}</span>
                <span className="stat__label">{t(`admin.nav.${r.nav}`)}</span>
              </Link>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
