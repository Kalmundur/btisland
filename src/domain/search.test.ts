import { describe, expect, it } from 'vitest';
import { foldForSearch, matchesSearch } from './search';

describe('search', () => {
  it('folds Icelandic letters and accents', () => {
    expect(foldForSearch('Davíð Jónsson')).toBe('david jonsson');
    expect(foldForSearch('Þór Ævarsson')).toBe('thor aevarsson');
    expect(foldForSearch('Norbert Bedö')).toBe('norbert bedo');
  });

  it('matches all terms across fields', () => {
    expect(matchesSearch(['Karl Claesson', 'KR', 'KR-B'], 'karl kr')).toBe(true);
    expect(matchesSearch(['Karl Claesson', 'KR'], 'karl bh')).toBe(false);
    expect(matchesSearch(['Óskar Agnarsson', 'HK'], 'oskar')).toBe(true);
    expect(matchesSearch(['anyone'], '   ')).toBe(true);
  });
});
