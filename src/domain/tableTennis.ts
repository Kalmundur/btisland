import type { TeamSide } from './types';

export const POINTS_TO_WIN_SET = 11;
export const DEFAULT_BEST_OF = 5;

/** First to 11, must win by 2 (mirrors public.is_valid_set_score). */
export function isValidSetScore(home: number, away: number): boolean {
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return false;
  const high = Math.max(home, away);
  const low = Math.min(home, away);
  if (high === POINTS_TO_WIN_SET) return low <= POINTS_TO_WIN_SET - 2;
  if (high > POINTS_TO_WIN_SET) return high - low === 2;
  return false;
}

export function setWinner(home: number, away: number): TeamSide | null {
  if (!isValidSetScore(home, away)) return null;
  return home > away ? 'home' : 'away';
}

export interface GameProgress {
  homeSets: number;
  awaySets: number;
  winner: TeamSide | null;
}

/** Counts completed sets and decides the game once a side reaches ceil(bestOf / 2). */
export function gameProgress(
  sets: ReadonlyArray<{ home: number; away: number }>,
  bestOf: number = DEFAULT_BEST_OF,
): GameProgress {
  const needed = Math.ceil(bestOf / 2);
  let homeSets = 0;
  let awaySets = 0;
  for (const s of sets) {
    const w = setWinner(s.home, s.away);
    if (w === 'home') homeSets++;
    else if (w === 'away') awaySets++;
    if (homeSets === needed || awaySets === needed) break;
  }
  const winner = homeSets === needed ? 'home' : awaySets === needed ? 'away' : null;
  return { homeSets, awaySets, winner };
}
