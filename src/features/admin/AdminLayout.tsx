import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, LogOut, Menu, Smartphone, X } from 'lucide-react';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { isCurrentUserOrganizer, signOut } from '../../data/authRepository';
import { LoadingState, NotConfigured, ErrorState } from '../../components/StateViews';
import { Button } from '../../components/Button';
import { APP_NAME } from '../../config/app';
import { RESOURCES } from './resources';

/** Organizer portal shell: desktop sidebar, mobile drawer. Access is enforced again by RLS. */
export function AdminLayout() {
  const { t } = useTranslation();
  const { configured, ready, session, userId, isAnonymous } = useAuth();
  const organizer = useAsync(
    () => (userId && !isAnonymous ? isCurrentUserOrganizer(userId) : Promise.resolve(false)),
    [userId, isAnonymous],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  if (!configured) return <div className="admin-gate"><NotConfigured /></div>;
  if (!ready) return <LoadingState />;
  if (!session || isAnonymous) return <Navigate to="/admin/login" replace />;
  if (organizer.error) return <div className="admin-gate"><ErrorState error={organizer.error} onRetry={organizer.reload} /></div>;
  if (organizer.data === undefined || organizer.loading) return <LoadingState />;

  const logout = async () => {
    await signOut();
    navigate('/admin/login', { replace: true });
  };

  if (!organizer.data) {
    return (
      <div className="admin-gate">
        <p>{t('admin.login.notOrganizer')}</p>
        <Button variant="secondary" onClick={() => void logout()}>
          {t('admin.signOut')}
        </Button>
      </div>
    );
  }

  const nav = (
    <nav className="admin-nav" aria-label={t('admin.title')}>
      <NavLink to="/admin" end className="admin-nav__item">
        <LayoutDashboard size={18} aria-hidden /> {t('admin.nav.dashboard')}
      </NavLink>
      {RESOURCES.map((r) => (
        <NavLink key={r.key} to={`/admin/${r.key}`} className="admin-nav__item">
          <r.icon size={18} aria-hidden /> {t(`admin.nav.${r.nav}`)}
        </NavLink>
      ))}
      <div className="admin-nav__spacer" />
      <NavLink to="/scorecard" className="admin-nav__item">
        <Smartphone size={18} aria-hidden /> {t('admin.backToApp')}
      </NavLink>
      <button type="button" className="admin-nav__item" onClick={() => void logout()}>
        <LogOut size={18} aria-hidden /> {t('admin.signOut')}
      </button>
    </nav>
  );

  return (
    <div className="admin">
      <header className="admin-topbar">
        <button type="button" className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label={t('common.menu')}>
          <Menu size={22} aria-hidden />
        </button>
        <span className="admin-topbar__title">{t('admin.title')}</span>
      </header>

      <aside className="admin-sidebar">
        <div className="admin-brand">
          {APP_NAME}
          <span className="admin-brand__sub">{t('admin.title')}</span>
        </div>
        {nav}
      </aside>

      {drawerOpen && (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-label={t('common.menu')}>
          <div className="admin-drawer__backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="admin-drawer__panel">
            <div className="admin-brand admin-brand--drawer">
              <span>
                {APP_NAME}
                <span className="admin-brand__sub">{t('admin.title')}</span>
              </span>
              <button type="button" className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label={t('common.close')}>
                <X size={20} aria-hidden />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
