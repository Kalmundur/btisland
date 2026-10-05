import type { ConflictConfirmation, SetEntry } from './types';

/**
 * Resolution of a conflicted game (the database decides; this only feeds the UI). One player
 * of either team picks the correct score and the game is resolved immediately; the newest
 * active resolution is the current one. Never decided by counting entries.
 */

export interface GameScore {
  home: number;
  away: number;
}

export const sameScore = (a: GameScore | null | undefined, b: GameScore | null | undefined) =>
  !!a && !!b && a.home === b.home && a.away === b.away;

/**
 * The distinct scores entered for one game, in a neutral order (by points, not by how many
 * scorers entered them – a count would suggest the majority decides).
 */
export function conflictCandidates(entries: readonly SetEntry[], matchNumber: number, gameNumber: number): GameScore[] {
  const seen = new Map<string, GameScore>();
  for (const e of entries) {
    if (e.matchNumber !== matchNumber || e.gameNumber !== gameNumber) continue;
    seen.set(`${e.homePoints}:${e.awayPoints}`, { home: e.homePoints, away: e.awayPoints });
  }
  return [...seen.values()].sort((a, b) => b.home - a.home || a.away - b.away);
}

/** The game's current player resolution (participants only can see these), or null. */
export function activeResolution(
  resolutions: readonly ConflictConfirmation[],
  matchNumber: number,
  gameNumber: number,
): GameScore | null {
  const r = resolutions.find((x) => x.matchNumber === matchNumber && x.gameNumber === gameNumber && x.supersededAt === null);
  return r ? { home: r.homePoints, away: r.awayPoints } : null;
}
