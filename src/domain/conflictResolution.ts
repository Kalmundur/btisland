import type { ConflictConfirmation, SetEntry, TeamSide } from './types';

/**
 * Cross-team resolution of a conflicted game (the database decides; this only explains the
 * state to players). A conflict resolves when the active HOME and AWAY confirmations name the
 * same score – never by counting entries.
 */

export interface GameScore {
  home: number;
  away: number;
}

const sameScore = (a: GameScore | null, b: GameScore | null) => !!a && !!b && a.home === b.home && a.away === b.away;

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

export type TeamResolutionStatus =
  /** Neither team has confirmed a score yet. */
  | 'none'
  /** Our team confirmed; the opponent has not confirmed anything yet. */
  | 'waiting_opponent'
  /** The opponent confirmed; our team has not. */
  | 'waiting_us'
  /** Both confirmed, different scores. */
  | 'disagree'
  /** Both confirmed the same score (the server resolves the game). */
  | 'agreed';

export interface TeamResolution {
  status: TeamResolutionStatus;
  /** Our team's active confirmation. */
  ours: GameScore | null;
  /** The opponent's active confirmation. */
  theirs: GameScore | null;
}

/** The current team-level state of one conflicted game, seen from `mySide`. */
export function teamResolution(
  confirmations: readonly ConflictConfirmation[],
  matchNumber: number,
  gameNumber: number,
  mySide: TeamSide,
): TeamResolution {
  const active = (side: TeamSide): GameScore | null => {
    const c = confirmations.find(
      (x) => x.matchNumber === matchNumber && x.gameNumber === gameNumber && x.side === side && x.supersededAt === null,
    );
    return c ? { home: c.homePoints, away: c.awayPoints } : null;
  };
  const ours = active(mySide);
  const theirs = active(mySide === 'home' ? 'away' : 'home');
  const status: TeamResolutionStatus =
    ours && theirs ? (sameScore(ours, theirs) ? 'agreed' : 'disagree') : ours ? 'waiting_opponent' : theirs ? 'waiting_us' : 'none';
  return { status, ours, theirs };
}
