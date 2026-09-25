/**
 * Derived encounter state from reconciled games – mirrors public.recompute_encounter.
 * Nothing here is stored: team score, phases, early finish and draw are recalculated
 * from scratch every time, so corrections to earlier games propagate automatically.
 */
import { DEFAULT_FORMAT, type CompetitionFormat, type MatchFormatEntry } from './matchFormat';
import { matchProgress } from './tableTennis';
import type { MatchStatus, ReconciledGame, TeamSide } from './types';

export interface MatchState extends MatchFormatEntry {
  status: MatchStatus;
  homeGames: number;
  awayGames: number;
  /** Only for counted (completed) matches. */
  winner: TeamSide | null;
  /** All reconciled games of this match, in order (including ones after a decision). */
  games: ReconciledGame[];
  conflictGames: number[];
}

export interface EncounterState {
  matches: MatchState[];
  homeScore: number;
  awayScore: number;
  /** A team reached six wins. */
  decided: boolean;
  /** Decided, or all ten matches completed. */
  finished: boolean;
  outcome: TeamSide | 'draw' | null;
  /** Matches 1–6 all have official winners. */
  phase1Complete: boolean;
  /** Doubles pairs may be chosen now. */
  doublesSelectionOpen: boolean;
  hasOpenConflict: boolean;
}

export interface EncounterInput {
  lineupsRevealed: boolean;
  doublesRevealed: boolean;
  games: readonly ReconciledGame[];
  /** Defaults to the regular ten-match format (the only one implemented). */
  format?: CompetitionFormat;
}

export function deriveEncounter({ lineupsRevealed, doublesRevealed, games, format = DEFAULT_FORMAT }: EncounterInput): EncounterState {
  const perMatch = format.matches.map((f) => {
    const own = games.filter((g) => g.matchNumber === f.number).sort((a, b) => a.gameNumber - b.gameNumber);
    const progress = matchProgress(
      own.map((g) => ({ gameNumber: g.gameNumber, homePoints: g.homePoints, awayPoints: g.awayPoints, conflict: g.status === 'conflict' })),
    );
    return { f, own, progress };
  });

  const unlocked: boolean[] = [];
  const counted: boolean[] = [];
  let phase1Complete = true;
  perMatch.forEach(({ f, progress }, i) => {
    if (f.phase === 1) {
      unlocked[i] = lineupsRevealed;
    } else if (f.phase === 2) {
      unlocked[i] = phase1Complete && doublesRevealed;
    } else {
      unlocked[i] = counted[format.matches.findIndex((m) => m.phase === 2)];
    }
    counted[i] = unlocked[i] && progress.winner !== null;
    if (f.phase === 1) phase1Complete = phase1Complete && counted[i];
  });

  let homeScore = 0;
  let awayScore = 0;
  perMatch.forEach(({ progress }, i) => {
    if (!counted[i]) return;
    if (progress.winner === 'home') homeScore++;
    else awayScore++;
  });
  const decided = homeScore >= format.winsToTakeEncounter || awayScore >= format.winsToTakeEncounter;
  const finished = decided || counted.every(Boolean);

  const matches: MatchState[] = perMatch.map(({ f, own, progress }, i) => {
    let status: MatchStatus;
    if (counted[i]) status = 'completed';
    else if (decided) status = 'not_played';
    else if (!unlocked[i]) status = 'locked';
    else if (progress.blockedByConflict) status = 'conflict';
    else if (own.length > 0) status = 'in_progress';
    else status = 'available';
    return {
      ...f,
      status,
      homeGames: progress.homeGames,
      awayGames: progress.awayGames,
      winner: counted[i] ? progress.winner : null,
      games: own,
      conflictGames: own.filter((g) => g.status === 'conflict').map((g) => g.gameNumber),
    };
  });

  const outcome: EncounterState['outcome'] = !finished
    ? null
    : homeScore > awayScore
      ? 'home'
      : awayScore > homeScore
        ? 'away'
        : 'draw';

  return {
    matches,
    homeScore,
    awayScore,
    decided,
    finished,
    outcome,
    phase1Complete,
    doublesSelectionOpen: phase1Complete && !decided,
    hasOpenConflict: matches.some((m) => m.status === 'conflict'),
  };
}
