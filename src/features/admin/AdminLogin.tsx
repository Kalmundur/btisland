import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { NotConfigured } from '../../components/StateViews';
import { signInOrganizer } from '../../data/authRepository';
import { useAuth } from '../../state/AuthContext';
import { APP_NAME } from '../../config/app';

/** Email/password sign-in for organizers (players never see this). */
export function AdminLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const expired = (useLocation().state as { expired?: boolean } | null)?.expired === true;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      await signInOrganizer(email.trim(), password);
      navigate('/admin', { replace: true });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <p className="login__brand">{APP_NAME}</p>
        <h1 className="login__title">{t('admin.login.title')}</h1>
        {!configured ? (
          <NotConfigured />
        ) : (
          <>
            <label className="field">
              <span className="field__label">{t('admin.login.email')}</span>
              <input
                className="field__control"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">{t('admin.login.password')}</span>
              <input
                className="field__control"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {expired && !failed && <p className="warning-text">{t('admin.login.expired')}</p>}
            {failed && (
              <p className="form-error" role="alert">
                {t('admin.login.failed')}
              </p>
            )}
            <Button type="submit" block disabled={busy || !email || !password}>
              {busy ? t('admin.login.submitting') : t('admin.login.submit')}
            </Button>
          </>
        )}
        <Link to="/scorecard" className="login__back">
          {t('admin.backToApp')}
        </Link>
      </form>
    </div>
  );
}
