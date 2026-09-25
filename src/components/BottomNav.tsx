import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ListOrdered, Settings, Users, type LucideIcon } from 'lucide-react';
import { useScorecardBadge } from '../hooks/useScorecardBadge';
import { scorecardRoute } from '../features/scorecard/scorecardMemory';

interface Tab {
  to: string;
  labelKey: 'nav.scorecard' | 'nav.standings' | 'nav.players' | 'nav.settings';
  icon: LucideIcon;
  /** Path prefixes that belong to this tab (deep links highlight their parent tab). */
  prefixes: string[];
}

const TABS: Tab[] = [
  { to: '/scorecard', labelKey: 'nav.scorecard', icon: ClipboardList, prefixes: ['/scorecard'] },
  { to: '/standings', labelKey: 'nav.standings', icon: ListOrdered, prefixes: ['/standings', '/live', '/team'] },
  { to: '/players', labelKey: 'nav.players', icon: Users, prefixes: ['/players', '/player'] },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, prefixes: ['/settings'] },
];

export function activeTab(pathname: string): string | null {
  const match = TABS.find((tab) => tab.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return match?.to ?? null;
}

export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = activeTab(pathname);
  const onScorecard = current === '/scorecard';
  const badge = useScorecardBadge(onScorecard ? 'in' : 'out');

  // Remember where the scorer was (e.g. a match), so returning to the tab restores it.
  useEffect(() => scorecardRoute.set(pathname), [pathname]);

  return (
    <nav className="bottom-nav" aria-label={t('nav.label')}>
      <div className="bottom-nav__inner">
        {TABS.map(({ to, labelKey, icon: Icon }) => {
          const active = current === to;
          const target = to === '/scorecard' && !onScorecard ? scorecardRoute.get() : to;
          const showBadge = to === '/scorecard' && badge !== null;
          return (
            <Link
              key={to}
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
              <span className="bottom-nav__label">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
