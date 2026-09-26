import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useErrorText } from '../../hooks/useErrorText';
import { rpcErrorKey } from '../../lib/errors';

export function AdminCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2 className="admin-card__title">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function AdminBack({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="admin-back">
      <ChevronLeft size={18} aria-hidden /> {label}
    </Link>
  );
}

export function AdminSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="field__control" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder ?? t('admin.crud.select')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Runs an organizer action with a busy flag and a visible error. Every consequential
 * action is also written to the audit log server-side (triggers / admin RPCs).
 */
export function useAdminAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function AdminError({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText('match.errors');
  if (!error) return null;
  // Organizer rules (e.g. one division per season) first, then the shared match messages.
  const adminKey = `admin.errors.${rpcErrorKey(error)}`;
  return (
    <p className="form-error" role="alert">
      {i18n.exists(adminKey) ? t(adminKey) : errorText(error)}
    </p>
  );
}

export const str = (v: unknown) => (v == null ? '' : String(v));
