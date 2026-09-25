import type { TeamSide } from './types';

export const POINTS_TO_WIN_GAME = 11;
/** Individual matches are best of 5 games ("lotur"). */
export const GAMES_TO_WIN_MATCH = 3;
export const MAX_GAMES = 5;

/**
 * Exact game rule (mirrors public.is_valid_set_score):
 *   winner == 11 and loser <= 9, or winner >= 12 and loser == winner - 2. Never a tie.
 */
export function isValidGameScore(home: number, away: number): boolean {
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return false;
  const winner = Math.max(home, away);
  const loser = Math.min(home, away);
  if (winner === POINTS_TO_WIN_GAME) return loser <= POINTS_TO_WIN_GAME - 2;
  return winner >= POINTS_TO_WIN_GAME + 1 && loser === winner - 2;
}

export function gameWinner(home: number, away: number): TeamSide | null {
  if (!isValidGameScore(home, away)) return null;
  return home > away ? 'home' : 'away';
}

export interface MatchProgress {
  homeGames: number;
  awayGames: number;
  winner: TeamSide | null;
  /** Games that count (up to and including the deciding game). */
  countedGames: number;
  /** A conflicted game stops progress until it is resolved. */
  blockedByConflict: boolean;
}

export interface GameLike {
  gameNumber: number;
  homePoints: number | null;
  awayPoints: number | null;
  conflict?: boolean;
}

/**
 * Walks games 1..5 in order: stops at 3 wins (later games never count), at a gap,
 * or at a conflicted game.
 */
export function matchProgress(games: readonly GameLike[]): MatchProgress {
  const sorted = [...games].sort((a, b) => a.gameNumber - b.gameNumber);
  let homeGames = 0;
  let awayGames = 0;
  let blockedByConflict = false;
  for (const g of sorted) {
    if (homeGames === GAMES_TO_WIN_MATCH || awayGames === GAMES_TO_WIN_MATCH) break;
    if (g.gameNumber !== homeGames + awayGames + 1) break;
    if (g.conflict || g.homePoints == null || g.awayPoints == null) {
      blockedByConflict = !!g.conflict;
      break;
    }
    const w = gameWinner(g.homePoints, g.awayPoints);
    if (!w) break;
    if (w === 'home') homeGames++;
    else awayGames++;
  }
  const winner = homeGames === GAMES_TO_WIN_MATCH ? 'home' : awayGames === GAMES_TO_WIN_MATCH ? 'away' : null;
  return { homeGames, awayGames, winner, countedGames: homeGames + awayGames, blockedByConflict };
}
