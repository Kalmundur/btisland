import { describe, expect, it } from 'vitest';
import { activeResolution, conflictCandidates } from './conflictResolution';
import type { ConflictConfirmation, SetEntry } from './types';

const entry = (player: string, home: number, away: number, game = 1): SetEntry => ({
  id: `${player}-${game}`, encounterId: 'e', matchNumber: 1, gameNumber: game, side: 'home',
  homePoints: home, awayPoints: away, submittedByPlayerId: player, clientEntryId: player, updatedAt: '',
});
const resolution = (home: number, away: number, supersededAt: string | null = null, game = 1): ConflictConfirmation => ({
  id: `${home}-${away}-${supersededAt}-${game}`, encounterId: 'e', matchNumber: 1, gameNumber: game, side: 'away', playerId: 'p',
  homePoints: home, awayPoints: away, createdAt: '', supersededAt,
});

describe('conflict candidates', () => {
  it('lists each distinct score once, never weighted by how many entered it', () => {
    const entries = [entry('a', 11, 8), entry('b', 11, 8), entry('c', 11, 8), entry('d', 11, 9), entry('x', 11, 2, 2)];
    expect(conflictCandidates(entries, 1, 1)).toEqual([{ home: 11, away: 8 }, { home: 11, away: 9 }]);
  });

  it('orders by points, independent of entry order', () => {
    const a = conflictCandidates([entry('a', 9, 11), entry('b', 11, 9)], 1, 1);
    const b = conflictCandidates([entry('b', 11, 9), entry('a', 9, 11)], 1, 1);
    expect(a).toEqual(b);
  });
});

describe('active resolution', () => {
  it('is the one non-superseded resolution of that game', () => {
    expect(activeResolution([], 1, 1)).toBeNull();
    const rows = [resolution(11, 9, '2026-10-06T12:00:00Z'), resolution(11, 8), resolution(11, 3, null, 2)];
    expect(activeResolution(rows, 1, 1)).toEqual({ home: 11, away: 8 });
    expect(activeResolution(rows, 1, 2)).toEqual({ home: 11, away: 3 });
    expect(activeResolution(rows, 1, 3)).toBeNull();
  });
});
