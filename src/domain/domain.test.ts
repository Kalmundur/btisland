import { describe, expect, it } from 'vitest';
import { formatRoundCode, isCompleteRoundCode, normalizeRoundCode } from './roundCode';
import { sideForSlot, slotsForSide, validateLineup } from './lineup';
import { addDays, pickActiveSession, todayInIceland } from './activeSession';
import type { RoundSession } from './types';

describe('round code', () => {
  it('normalizes pasted input to six digits', () => {
    expect(normalizeRoundCode(' 482-913 ')).toBe('482913');
    expect(normalizeRoundCode('4829131234')).toBe('482913');
    expect(normalizeRoundCode('abc')).toBe('');
  });
  it('detects complete codes', () => {
    expect(isCompleteRoundCode('482913')).toBe(true);
    expect(isCompleteRoundCode('48291')).toBe(false);
    expect(isCompleteRoundCode('48291a')).toBe(false);
  });
  it('formats for display', () => {
    expect(formatRoundCode('482913')).toBe('482 913');
  });
});

describe('lineup', () => {
  it('assigns A/B/C to home and X/Y/Z to away', () => {
    expect(slotsForSide('home')).toEqual(['A', 'B', 'C']);
    expect(slotsForSide('away')).toEqual(['X', 'Y', 'Z']);
    expect(sideForSlot('B')).toBe('home');
    expect(sideForSlot('Z')).toBe('away');
  });
  it('validates drafts like the server does', () => {
    expect(validateLineup('home', { A: 'p1', B: 'p2', C: 'p3' })).toBeNull();
    expect(validateLineup('home', { A: 'p1', B: 'p2' })).toBe('incomplete');
    expect(validateLineup('home', { A: 'p1', B: 'p1', C: 'p3' })).toBe('duplicate_player');
    expect(validateLineup('away', { A: 'p1', Y: 'p2', Z: 'p3' })).toBe('wrong_side');
  });
});

describe('active session', () => {
  const s = (id: string, roundDate: string, joinedAt: string): RoundSession => ({
    id,
    roundId: id,
    encounterId: id,
    teamId: 't',
    playerId: 'p',
    joinedAt,
    roundDate,
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('uses UTC date for Iceland', () => {
    expect(todayInIceland(new Date('2026-10-17T23:30:00Z'))).toBe('2026-10-17');
  });

  it('keeps sessions active through the day after the round and picks the latest join', () => {
    const sessions = [s('r3', '2026-10-17', '2026-10-17T10:00:00Z'), s('r4', '2026-10-17', '2026-10-17T14:00:00Z')];
    expect(pickActiveSession(sessions, '2026-10-17')?.id).toBe('r4');
    expect(pickActiveSession(sessions, '2026-10-18')?.id).toBe('r4');
    expect(pickActiveSession(sessions, '2026-10-19')).toBeNull();
  });
});
