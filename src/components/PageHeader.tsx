import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Show a back button (history back, or `backTo` when there is no history). */
  back?: boolean;
  backTo?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, back, backTo = '/', actions }: PageHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(backTo);
  };

  return (
    <header className="page-header">
      <div className="page-header__inner">
        {back && (
          <button type="button" className="icon-btn page-header__back" onClick={goBack} aria-label={t('common.back')}>
            <ChevronLeft size={24} aria-hidden />
          </button>
        )}
        <div className="page-header__titles">
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
