/**
 * The four permanent player-app tabs and which routes belong to each (deep links
 * highlight their parent tab). Labels and icons live in BottomNav.
 */
export type TabKey = 'scorecard' | 'schedule' | 'standings' | 'settings';

export const TABS: ReadonlyArray<{ key: TabKey; to: string; prefixes: readonly string[] }> = [
  { key: 'scorecard', to: '/scorecard', prefixes: ['/scorecard'] },
  // /live/* are the schedule's own detail pages (round, match) and old schedule links.
  { key: 'schedule', to: '/schedule', prefixes: ['/schedule', '/live'] },
  // Team and player pages are reached from Staða (table, Top 10, full player list).
  { key: 'standings', to: '/standings', prefixes: ['/standings', '/team', '/player', '/players'] },
  { key: 'settings', to: '/settings', prefixes: ['/settings'] },
];

export function activeTab(pathname: string): TabKey | null {
  const match = TABS.find((tab) => tab.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return match?.key ?? null;
}
