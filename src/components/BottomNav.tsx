import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ClipboardList, ListOrdered, Settings, type LucideIcon } from 'lucide-react';
import { useScorecardBadge } from '../hooks/useScorecardBadge';
import { scorecardRoute } from '../features/scorecard/scorecardMemory';
import { activeTab, TABS, type TabKey } from '../lib/navigation';

const ICONS: Record<TabKey, LucideIcon> = {
  scorecard: ClipboardList,
  schedule: CalendarDays,
  standings: ListOrdered,
  settings: Settings,
};

export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = activeTab(pathname);
  const onScorecard = current === 'scorecard';
  const badge = useScorecardBadge(onScorecard ? 'in' : 'out');

  // Remember where the scorer was (e.g. a match), so returning to the tab restores it.
  useEffect(() => scorecardRoute.set(pathname), [pathname]);

  return (
    <nav className="bottom-nav" aria-label={t('nav.label')}>
      <div className="bottom-nav__inner">
        {TABS.map(({ key, to }) => {
          const Icon = ICONS[key];
          const active = current === key;
          const target = key === 'scorecard' && !onScorecard ? scorecardRoute.get() : to;
          const showBadge = key === 'scorecard' && badge !== null;
          return (
            <Link
              key={key}
              to={target}
              className={`bottom-nav__item${active ? ' bottom-nav__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="bottom-nav__icon">
                <Icon size={24} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {showBadge && (
                  <span
                    className={`bottom-nav__badge bottom-nav__badge--${badge}`}
                    role="status"
                    aria-label={badge === 'conflict' ? t('nav.badgeConflict') : t('nav.badgeActive')}
                  >
                    {badge === 'conflict' ? '!' : null}
                  </span>
                )}
              </span>
              <span className="bottom-nav__label">{t(`nav.${key}`)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
