import { describe, expect, it } from 'vitest';
import { formatRoundCode, isCompleteRoundCode, normalizeRoundCode } from './roundCode';
import { sideForSlot, slotsForSide, validateLineup } from './lineup';
import { computeStandings } from './standings';
import { rankPlayers } from './playerRanking';
import { addDays, pickActiveSession, todayInIceland } from './activeSession';
import type { Encounter, EncounterGame, RoundSession } from './types';

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

const enc = (id: string, home: string, away: string, hs: number | null, as: number | null, status: Encounter['status'] = 'completed'): Encounter => ({
  id,
  roundId: 'r',
  homeTeamId: home,
  awayTeamId: away,
  status,
  homeScore: hs,
  awayScore: as,
  lineupsRevealedAt: null,
  doublesRevealedAt: null,
  resultHash: null,
  resultVersion: 0,
});

describe('standings', () => {
  const teams = [
    { id: 'a', name: 'KR-A' },
    { id: 'b', name: 'BH-A' },
    { id: 'c', name: 'Víkingur-A' },
  ];

  it('lists every team with zeros before any results', () => {
    const rows = computeStandings(teams, []);
    expect(rows.map((r) => r.teamName)).toEqual(['BH-A', 'KR-A', 'Víkingur-A']);
    expect(rows.every((r) => r.played === 0 && r.points === 0 && r.position === 1)).toBe(true);
  });

  it('awards points and sorts by points then game difference', () => {
    const rows = computeStandings(teams, [
      enc('1', 'a', 'b', 6, 4),
      enc('2', 'c', 'a', 5, 5),
      enc('3', 'b', 'c', 7, 3),
      enc('4', 'a', 'c', null, null, 'in_progress'), // ignored
    ]);
    expect(rows.map((r) => [r.teamName, r.played, r.points, r.position])).toEqual([
      ['KR-A', 2, 3, 1],
      ['BH-A', 2, 2, 2],
      ['Víkingur-A', 2, 1, 3],
    ]);
    expect(rows[0]).toMatchObject({ won: 1, drawn: 1, lost: 0, gamesFor: 11, gamesAgainst: 9 });
  });
});

describe('player ranking', () => {
  const game = (n: number, home: string, away: string, winner: 'home' | 'away' | null, kind: 'singles' | 'doubles' = 'singles'): EncounterGame => ({
    id: String(n),
    encounterId: 'e',
    matchNumber: n,
    kind,
    status: winner ? 'completed' : 'in_progress',
    homePlayerIds: [home],
    awayPlayerIds: [away],
    homeGames: 0,
    awayGames: 0,
    winner,
  });

  it('ranks by singles wins and ignores doubles/undecided games', () => {
    const rows = rankPlayers(
      [game(1, 'p1', 'p2', 'home'), game(2, 'p1', 'p3', 'home'), game(3, 'p2', 'p3', 'home'), game(4, 'p3', 'p1', null), game(5, 'p3', 'p2', 'home', 'doubles')],
      10,
    );
    expect(rows).toEqual([
      { position: 1, playerId: 'p1', won: 2, lost: 0 },
      { position: 2, playerId: 'p2', won: 1, lost: 1 },
      { position: 3, playerId: 'p3', won: 0, lost: 2 },
    ]);
    expect(rankPlayers([], 10)).toEqual([]);
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
