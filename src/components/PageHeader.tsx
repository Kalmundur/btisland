import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
  const location = useLocation();
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  // A shared link opened directly has no in-app history: go to the parent page instead.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(backTo, { replace: true }));

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const publish = () => document.documentElement.style.setProperty('--page-header-h', `${node.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="page-header" ref={ref}>
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
