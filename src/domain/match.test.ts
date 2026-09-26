import { describe, expect, it } from 'vitest';
import { gameWinner, isValidGameScore, matchProgress } from './tableTennis';
import { MATCH_FORMAT } from './matchFormat';
import { reconcileGame } from './reconcile';
import { deriveEncounter } from './encounterState';
import { DOUBLES_CONFIRMATIONS, currentConfirmers, resultConfirmationState, selectionProgress } from './confirmation';
import { validateDoubles, validateLineup } from './lineup';
import { scorerView } from './scorer';
import type { ReconciledGame, ResultConfirmation, TeamSelection, TeamSide } from './types';

// --- helpers -------------------------------------------------------------------------
const game = (match: number, n: number, h: number | null, a: number | null, status: 'agreed' | 'conflict' = 'agreed'): ReconciledGame => ({
  encounterId: 'e',
  matchNumber: match,
  gameNumber: n,
  status,
  homePoints: status === 'conflict' ? null : h,
  awayPoints: status === 'conflict' ? null : a,
  submitterCount: 1,
});

/** Three straight games for the winner. */
const won = (match: number, winner: TeamSide): ReconciledGame[] =>
  [1, 2, 3].map((n) => (winner === 'home' ? game(match, n, 11, 6) : game(match, n, 6, 11)));

const revealed = (games: ReconciledGame[], doublesRevealed = true) =>
  deriveEncounter({ lineupsRevealed: true, doublesRevealed, games });

// --- game scores ---------------------------------------------------------------------
describe('valid game scores', () => {
  it.each([
    [11, 0], [11, 8], [11, 9], [9, 11], [12, 10], [13, 11], [18, 16], [10, 12],
  ])('%i–%i is valid', (h, a) => expect(isValidGameScore(h, a)).toBe(true));

  it.each([
    [10, 8], [10, 10], [11, 10], [12, 9], [13, 10], [15, 12], [11, 11], [0, 0], [12, 12], [-1, 11], [11.5, 9], [14, 11],
  ])('%i–%i is invalid', (h, a) => expect(isValidGameScore(h, a)).toBe(false));

  it('decides the game winner, never a tie', () => {
    expect(gameWinner(11, 7)).toBe('home');
    expect(gameWinner(16, 18)).toBe('away');
    expect(gameWinner(11, 10)).toBeNull();
  });
});

describe('best of five', () => {
  const g = (n: number, h: number, a: number) => ({ gameNumber: n, homePoints: h, awayPoints: a });
  it('3–0', () => {
    expect(matchProgress([g(1, 11, 3), g(2, 11, 5), g(3, 12, 10)])).toMatchObject({ homeGames: 3, awayGames: 0, winner: 'home' });
  });
  it('3–1', () => {
    expect(matchProgress([g(1, 11, 3), g(2, 8, 11), g(3, 11, 9), g(4, 13, 11)])).toMatchObject({ homeGames: 3, awayGames: 1, winner: 'home' });
  });
  it('3–2 for the away side', () => {
    expect(matchProgress([g(1, 11, 3), g(2, 8, 11), g(3, 11, 9), g(4, 5, 11), g(5, 9, 11)])).toMatchObject({ homeGames: 2, awayGames: 3, winner: 'away' });
  });
  it('ignores games after the deciding one and stops at gaps', () => {
    expect(matchProgress([g(1, 11, 0), g(2, 11, 0), g(3, 11, 0), g(4, 0, 11)])).toMatchObject({ homeGames: 3, awayGames: 0, countedGames: 3 });
    expect(matchProgress([g(1, 11, 0), g(3, 11, 0)])).toMatchObject({ homeGames: 1, winner: null });
  });
  it('a conflicted game blocks progress', () => {
    const p = matchProgress([g(1, 11, 0), { gameNumber: 2, homePoints: null, awayPoints: null, conflict: true }, g(3, 11, 0)]);
    expect(p).toMatchObject({ homeGames: 1, winner: null, blockedByConflict: true });
  });
});

// --- reconciliation --------------------------------------------------------------------
describe('reconciliation', () => {
  it('no submissions -> no canonical score', () => {
    expect(reconcileGame([])).toEqual({ status: 'none', submitterCount: 0 });
  });
  it('a single submission is the reconciled score', () => {
    expect(reconcileGame([{ homePoints: 11, awayPoints: 8 }])).toMatchObject({ status: 'agreed', homePoints: 11, awayPoints: 8 });
  });
  it('identical submissions agree', () => {
    expect(reconcileGame([{ homePoints: 11, awayPoints: 8 }, { homePoints: 11, awayPoints: 8 }])).toMatchObject({ status: 'agreed', submitterCount: 2 });
  });
  it('detects conflicts and never uses majority voting (Daði 11–8, Pétur 11–8, Karl 11–9)', () => {
    const r = reconcileGame([{ homePoints: 11, awayPoints: 8 }, { homePoints: 11, awayPoints: 8 }, { homePoints: 11, awayPoints: 9 }]);
    expect(r.status).toBe('conflict');
    expect(r).not.toHaveProperty('homePoints');
    expect(r.submitterCount).toBe(3);
  });
  it('resolves once the differing scorer edits their own entry', () => {
    expect(reconcileGame([{ homePoints: 11, awayPoints: 8 }, { homePoints: 11, awayPoints: 8 }, { homePoints: 11, awayPoints: 8 }]).status).toBe('agreed');
  });
});

// --- encounter derivation ----------------------------------------------------------------
describe('encounter state', () => {
  it('uses the official order and phases', () => {
    expect(MATCH_FORMAT.map((m) => (m.kind === 'doubles' ? 'D' : `${m.homeSlot}${m.awaySlot}`))).toEqual(
      ['AY', 'BZ', 'CX', 'AZ', 'BX', 'CY', 'D', 'AX', 'BY', 'CZ'],
    );
    expect(MATCH_FORMAT.map((m) => m.phase)).toEqual([1, 1, 1, 1, 1, 1, 2, 3, 3, 3]);
  });

  it('everything is locked until both lineups are revealed', () => {
    const s = deriveEncounter({ lineupsRevealed: false, doublesRevealed: false, games: [] });
    expect(s.matches.every((m) => m.status === 'locked')).toBe(true);
  });

  it('phase unlocking: 1–6 concurrently, doubles after 1–6 + reveal, 8–10 after doubles', () => {
    let s = revealed([], false);
    expect(s.matches.map((m) => m.status)).toEqual([
      'available', 'available', 'available', 'available', 'available', 'available', 'locked', 'locked', 'locked', 'locked',
    ]);
    const phase1 = [...won(1, 'home'), ...won(2, 'away'), ...won(3, 'home'), ...won(4, 'away'), ...won(5, 'home'), ...won(6, 'away')];
    s = revealed(phase1, false);
    expect(s.phase1Complete).toBe(true);
    expect(s.doublesSelectionOpen).toBe(true);
    expect(s.matches[6].status).toBe('locked');
    s = revealed(phase1, true);
    expect(s.matches[6].status).toBe('available');
    expect(s.matches[7].status).toBe('locked');
    s = revealed([...phase1, ...won(7, 'home')], true);
    expect(s.matches.slice(7).map((m) => m.status)).toEqual(['available', 'available', 'available']);
  });

  it('derives the team score from completed matches only', () => {
    const s = revealed([...won(1, 'home'), ...won(2, 'away'), game(3, 1, 11, 5)]);
    expect([s.homeScore, s.awayScore]).toEqual([1, 1]);
    expect(s.matches[2].status).toBe('in_progress');
  });

  it('first to 6 ends the encounter; the rest is not played and has no winner', () => {
    const phase1 = [1, 2, 3, 4, 5].flatMap((m) => won(m, 'home'));
    const s = revealed([...phase1, ...won(6, 'away'), ...won(7, 'home'), game(8, 1, 11, 3)]);
    expect([s.homeScore, s.awayScore]).toEqual([6, 1]);
    expect(s.decided).toBe(true);
    expect(s.finished).toBe(true);
    expect(s.outcome).toBe('home');
    expect(s.matches.slice(7).map((m) => [m.status, m.winner])).toEqual([
      ['not_played', null], ['not_played', null], ['not_played', null],
    ]);
  });

  it('6–0 after phase 1 skips doubles entirely', () => {
    const s = revealed([1, 2, 3, 4, 5, 6].flatMap((m) => won(m, 'away')), false);
    expect(s.outcome).toBe('away');
    expect(s.doublesSelectionOpen).toBe(false);
    expect(s.matches[6].status).toBe('not_played');
  });

  it('5–5 after all ten is a draw', () => {
    const wins: TeamSide[] = ['home', 'home', 'home', 'away', 'away', 'away', 'home', 'away', 'home', 'away'];
    const s = revealed(wins.flatMap((w, i) => won(i + 1, w)));
    expect([s.homeScore, s.awayScore]).toEqual([5, 5]);
    expect(s.finished).toBe(true);
    expect(s.outcome).toBe('draw');
  });

  it('a correction of an earlier game recalculates everything (un-deciding the encounter)', () => {
    const phase1 = [1, 2, 3, 4, 5].flatMap((m) => won(m, 'home'));
    const before = revealed([...phase1, ...won(6, 'away'), ...won(7, 'home')]);
    expect(before.decided).toBe(true);
    // Match 7 game 3 corrected to an away win: 2–1 -> doubles still in progress, not decided.
    const corrected = [...phase1, ...won(6, 'away'), game(7, 1, 11, 6), game(7, 2, 11, 6), game(7, 3, 6, 11)];
    const after = revealed(corrected);
    expect(after.decided).toBe(false);
    expect([after.homeScore, after.awayScore]).toEqual([5, 1]);
    expect(after.matches[6].status).toBe('in_progress');
    expect(after.matches[7].status).toBe('locked');
  });

  it('a conflict marks the match and blocks its result', () => {
    const s = revealed([game(1, 1, 11, 5), game(1, 2, null, null, 'conflict'), game(1, 3, 11, 5), game(1, 4, 11, 5)]);
    expect(s.matches[0].status).toBe('conflict');
    expect(s.matches[0].conflictGames).toEqual([2]);
    expect(s.hasOpenConflict).toBe(true);
    expect(s.homeScore).toBe(0);
  });
});

// --- lineups / doubles --------------------------------------------------------------------
describe('lineup and doubles selection', () => {
  it('lineup needs three distinct players', () => {
    expect(validateLineup('home', { A: 'p1', B: 'p2', C: 'p2' })).toBe('duplicate_player');
    expect(validateLineup('away', { X: 'p1', Y: 'p2', Z: 'p3' })).toBeNull();
  });

  it('doubles needs two distinct roster players', () => {
    const roster = ['p1', 'p2', 'p3'];
    expect(validateDoubles(['p1', 'p1'], roster)).toBe('duplicate_player');
    expect(validateDoubles(['p1', undefined], roster)).toBe('incomplete');
    expect(validateDoubles(['p1', 'p9'], roster)).toBe('not_on_roster');
    expect(validateDoubles(['p3', 'p1'], roster)).toBeNull();
  });

  const sel = (over: Partial<TeamSelection>): TeamSelection => ({
    id: 's', encounterId: 'e', teamId: 't', side: 'home', version: 1, confirmedCount: 1, lockedAt: null, confirmations: [], ...over,
  });

  it('two-person confirmation: proposer is #1, a different player is #2, same player never counts twice', () => {
    const one = sel({ confirmations: [{ playerId: 'p1', version: 1 }, { playerId: 'p1', version: 1 }] });
    expect(selectionProgress(one, 'p1')).toMatchObject({ stage: 'pending', count: 1, iConfirmed: true, canConfirm: false });
    expect(selectionProgress(one, 'p2')).toMatchObject({ canConfirm: true });
    const two = sel({ confirmations: [{ playerId: 'p1', version: 1 }, { playerId: 'p2', version: 1 }] });
    expect(selectionProgress(two, 'p3')).toMatchObject({ stage: 'locked', count: 2, canConfirm: false });
  });

  it('doubles pair: the submitter alone locks it', () => {
    const submitted = sel({ confirmations: [{ playerId: 'p1', version: 1 }] });
    expect(selectionProgress(submitted, 'p2', DOUBLES_CONFIRMATIONS)).toMatchObject({ stage: 'locked', count: 1, canConfirm: false });
    expect(selectionProgress(sel({ confirmedCount: 1 }), null, DOUBLES_CONFIRMATIONS).stage).toBe('locked');
  });

  it('a new version invalidates earlier confirmations', () => {
    const edited = sel({
      version: 2,
      confirmations: [{ playerId: 'p1', version: 1 }, { playerId: 'p2', version: 1 }, { playerId: 'p2', version: 2 }],
    });
    expect(currentConfirmers(edited)).toEqual(['p2']);
    expect(selectionProgress(edited, 'p1')).toMatchObject({ stage: 'pending', count: 1, canConfirm: true });
  });

  it('opponent sees only the server count', () => {
    expect(selectionProgress(sel({ confirmedCount: 1 }), 'x')).toMatchObject({ stage: 'pending', count: 1 });
    expect(selectionProgress(undefined, 'x').stage).toBe('missing');
  });
});

// --- result confirmation ----------------------------------------------------------------
describe('result confirmation', () => {
  const rc = (side: TeamSide, hash: string, invalidatedAt: string | null = null): ResultConfirmation => ({
    id: `${side}${hash}`, encounterId: 'e', side, playerId: 'p', resultHash: hash, resultVersion: 1, createdAt: '', invalidatedAt,
  });

  it('needs one valid confirmation per team for the current result', () => {
    expect(resultConfirmationState([rc('home', 'h1')], 'h1')).toMatchObject({ official: false });
    expect(resultConfirmationState([rc('home', 'h1'), rc('away', 'h1')], 'h1').official).toBe(true);
  });

  it('is invalidated when the result changes afterwards', () => {
    const s = resultConfirmationState([rc('home', 'h1'), rc('away', 'h1')], 'h2');
    expect(s).toEqual({ home: null, away: null, official: false });
  });

  it('ignores confirmations invalidated by an organizer reopen', () => {
    expect(resultConfirmationState([rc('home', 'h1', 'now'), rc('away', 'h1')], 'h1').official).toBe(false);
  });
});

// --- scorer view ----------------------------------------------------------------------------
describe('scorer view', () => {
  it('own entries (even unsynced) drive local progress and the next game', () => {
    const v = scorerView([game(1, 1, 11, 5)], [{ gameNumber: 2, homePoints: 11, awayPoints: 9, pending: true }]);
    expect(v).toMatchObject({ homeGames: 2, nextGame: 3 });
    expect(v.rows[1].mine?.pending).toBe(true);
  });

  it('closes the scorecard at 3 won games', () => {
    const mine = [1, 2, 3].map((n) => ({ gameNumber: n, homePoints: 6, awayPoints: 11, pending: false }));
    expect(scorerView([], mine)).toMatchObject({ winner: 'away', nextGame: null });
  });

  it('flags conflicts but keeps the scorer\'s own value', () => {
    const v = scorerView([game(1, 1, null, null, 'conflict')], [{ gameNumber: 1, homePoints: 11, awayPoints: 8, pending: false }]);
    expect(v.rows[0]).toMatchObject({ conflict: true, homePoints: 11, awayPoints: 8 });
    expect(v.nextGame).toBe(2);
  });
});
