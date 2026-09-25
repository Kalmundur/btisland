import { describe, expect, it } from 'vitest';
import { formatDate, formatShortDate, formatTime } from './format';

describe('date formatting', () => {
  it('formats Icelandic dates without relying on Intl locale data', () => {
    expect(formatDate('2026-09-19', 'is')).toBe('lau. 19. sep. 2026');
    expect(formatDate('2027-03-06', 'is')).toBe('lau. 6. mar. 2027');
    expect(formatShortDate('2026-11-22', 'is')).toBe('22. nóv.');
  });

  it('formats English dates', () => {
    expect(formatDate('2026-11-22', 'en')).toBe('Sun 22 Nov 2026');
    expect(formatShortDate('2027-01-09', 'en')).toBe('9 Jan');
  });

  it('trims seconds from times and keeps unknown times null', () => {
    expect(formatTime('13:00:00')).toBe('13:00');
    expect(formatTime(null)).toBeNull();
  });
});
