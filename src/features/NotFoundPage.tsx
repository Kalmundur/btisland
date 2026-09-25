import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/StateViews';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('errors.notFound')} />
      <EmptyState>
        <Link to="/scorecard" className="accent">
          {t('errors.goHome')}
        </Link>
      </EmptyState>
    </>
  );
}
