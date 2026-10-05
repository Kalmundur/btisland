import { describe, expect, it } from 'vitest';
import { conflictCandidates, teamResolution } from './conflictResolution';
import type { ConflictConfirmation, SetEntry, TeamSide } from './types';

const entry = (player: string, home: number, away: number, game = 1): SetEntry => ({
  id: `${player}-${game}`, encounterId: 'e', matchNumber: 1, gameNumber: game, side: 'home',
  homePoints: home, awayPoints: away, submittedByPlayerId: player, clientEntryId: player, updatedAt: '',
});
const conf = (side: TeamSide, home: number, away: number, supersededAt: string | null = null): ConflictConfirmation => ({
  id: `${side}-${home}-${away}-${supersededAt}`, encounterId: 'e', matchNumber: 1, gameNumber: 1, side, playerId: side,
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

describe('team resolution state', () => {
  it('none -> waiting for the opponent -> agreed', () => {
    expect(teamResolution([], 1, 1, 'home').status).toBe('none');
    expect(teamResolution([conf('home', 11, 9)], 1, 1, 'home')).toMatchObject({ status: 'waiting_opponent', ours: { home: 11, away: 9 }, theirs: null });
    expect(teamResolution([conf('home', 11, 9)], 1, 1, 'away').status).toBe('waiting_us');
    expect(teamResolution([conf('home', 11, 9), conf('away', 11, 9)], 1, 1, 'away').status).toBe('agreed');
  });

  it('different scores from the two teams are a disagreement', () => {
    expect(teamResolution([conf('home', 11, 9), conf('away', 11, 8)], 1, 1, 'home')).toMatchObject({
      status: 'disagree', ours: { home: 11, away: 9 }, theirs: { home: 11, away: 8 },
    });
  });

  it('superseded confirmations no longer count', () => {
    const rows = [conf('home', 11, 8, '2026-10-05T12:00:00Z'), conf('home', 11, 9), conf('away', 11, 8, '2026-10-05T12:01:00Z')];
    expect(teamResolution(rows, 1, 1, 'home')).toMatchObject({ status: 'waiting_opponent', ours: { home: 11, away: 9 } });
  });
});
