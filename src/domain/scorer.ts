/**
 * One scorer's view of an individual match: their own entries (incl. unsynced ones)
 * take precedence for their local progress; reconciled values fill the rest.
 */
import { GAMES_TO_WIN_MATCH, MAX_GAMES, matchProgress } from './tableTennis';
import type { ReconciledGame, TeamSide } from './types';

export interface OwnEntry {
  gameNumber: number;
  homePoints: number;
  awayPoints: number;
  /** Still in the offline outbox – not acknowledged by the server. */
  pending: boolean;
}

export interface ScorerGameRow {
  gameNumber: number;
  mine: OwnEntry | null;
  reconciled: ReconciledGame | null;
  /** Value used for this scorer's progress. */
  homePoints: number | null;
  awayPoints: number | null;
  conflict: boolean;
}

export interface ScorerView {
  rows: ScorerGameRow[];
  homeGames: number;
  awayGames: number;
  winner: TeamSide | null;
  /** Game to enter next, or null when the match is decided (from this scorer's view). */
  nextGame: number | null;
}

export function scorerView(reconciled: readonly ReconciledGame[], mine: readonly OwnEntry[]): ScorerView {
  const numbers = [...new Set([...reconciled.map((g) => g.gameNumber), ...mine.map((m) => m.gameNumber)])].sort((a, b) => a - b);
  const rows: ScorerGameRow[] = numbers.map((n) => {
    const own = mine.find((m) => m.gameNumber === n) ?? null;
    const rec = reconciled.find((g) => g.gameNumber === n) ?? null;
    const recAgreed = rec?.status === 'agreed';
    return {
      gameNumber: n,
      mine: own,
      reconciled: rec,
      homePoints: own ? own.homePoints : recAgreed ? rec!.homePoints : null,
      awayPoints: own ? own.awayPoints : recAgreed ? rec!.awayPoints : null,
      conflict: rec?.status === 'conflict',
    };
  });

  const progress = matchProgress(rows.map((r) => ({ gameNumber: r.gameNumber, homePoints: r.homePoints, awayPoints: r.awayPoints })));
  const decided = progress.homeGames === GAMES_TO_WIN_MATCH || progress.awayGames === GAMES_TO_WIN_MATCH;
  const next = progress.countedGames + 1;
  return {
    rows,
    homeGames: progress.homeGames,
    awayGames: progress.awayGames,
    winner: progress.winner,
    nextGame: decided || next > MAX_GAMES ? null : next,
  };
}
