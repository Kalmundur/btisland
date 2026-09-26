import { describe, expect, it } from 'vitest';
import { activeTab, TABS } from './navigation';

describe('bottom navigation', () => {
  it('has exactly the four tabs in order', () => {
    expect(TABS.map((t) => t.to)).toEqual(['/scorecard', '/schedule', '/standings', '/settings']);
  });

  it('highlights the parent tab for every page', () => {
    expect(activeTab('/scorecard')).toBe('scorecard');
    expect(activeTab('/scorecard/match/4')).toBe('scorecard');
    expect(activeTab('/schedule')).toBe('schedule');
    expect(activeTab('/live/round/abc')).toBe('schedule');
    expect(activeTab('/live/match/abc')).toBe('schedule');
    expect(activeTab('/standings')).toBe('standings');
    expect(activeTab('/team/abc')).toBe('standings');
    expect(activeTab('/player/abc')).toBe('standings');
    expect(activeTab('/players')).toBe('standings');
    expect(activeTab('/settings')).toBe('settings');
  });

  it('does not confuse similar prefixes', () => {
    expect(activeTab('/playersx')).toBeNull();
    expect(activeTab('/admin')).toBeNull();
  });
});
