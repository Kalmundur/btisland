import type { LineupSlotLetter } from './types';

export type MatchPhase = 1 | 2 | 3;

export interface MatchFormatEntry {
  number: number;
  kind: 'singles' | 'doubles';
  /** null for doubles */
  homeSlot: LineupSlotLetter | null;
  awaySlot: LineupSlotLetter | null;
  phase: MatchPhase;
}

/**
 * A competition format (mirrors public.competition_formats + public.match_format).
 * Divisions reference one by key. Only REGULAR_TEN_MATCH is implemented; a seven-match
 * playoff format would be added here (and to the database) with its own phase rules.
 */
export interface CompetitionFormat {
  key: CompetitionFormatKey;
  matches: readonly MatchFormatEntry[];
  /** First team to this many individual wins takes the encounter. */
  winsToTakeEncounter: number;
  /** Individual matches are best of (2n-1) games. */
  gamesToWinMatch: number;
}

export type CompetitionFormatKey = 'REGULAR_TEN_MATCH';

/**
 * Official regular-season order.
 * Phase 1: matches 1–6 (concurrent, two tables). Phase 2: doubles. Phase 3: matches 8–10.
 */
const REGULAR_TEN_MATCH: CompetitionFormat = {
  key: 'REGULAR_TEN_MATCH',
  winsToTakeEncounter: 6,
  gamesToWinMatch: 3,
  matches: [
    { number: 1, kind: 'singles', homeSlot: 'A', awaySlot: 'Y', phase: 1 },
    { number: 2, kind: 'singles', homeSlot: 'B', awaySlot: 'Z', phase: 1 },
    { number: 3, kind: 'singles', homeSlot: 'C', awaySlot: 'X', phase: 1 },
    { number: 4, kind: 'singles', homeSlot: 'A', awaySlot: 'Z', phase: 1 },
    { number: 5, kind: 'singles', homeSlot: 'B', awaySlot: 'X', phase: 1 },
    { number: 6, kind: 'singles', homeSlot: 'C', awaySlot: 'Y', phase: 1 },
    { number: 7, kind: 'doubles', homeSlot: null, awaySlot: null, phase: 2 },
    { number: 8, kind: 'singles', homeSlot: 'A', awaySlot: 'X', phase: 3 },
    { number: 9, kind: 'singles', homeSlot: 'B', awaySlot: 'Y', phase: 3 },
    { number: 10, kind: 'singles', homeSlot: 'C', awaySlot: 'Z', phase: 3 },
  ],
};

export const COMPETITION_FORMATS: Record<CompetitionFormatKey, CompetitionFormat> = { REGULAR_TEN_MATCH };
export const DEFAULT_FORMAT: CompetitionFormat = REGULAR_TEN_MATCH;

export function isCompetitionFormatKey(key: string): key is CompetitionFormatKey {
  return key in COMPETITION_FORMATS;
}

// Regular-format shortcuts used throughout the scoring UI.
export const MATCH_FORMAT = REGULAR_TEN_MATCH.matches;
export const MATCH_COUNT = MATCH_FORMAT.length;
export const DOUBLES_MATCH = 7;
export const WINS_TO_TAKE_ENCOUNTER = REGULAR_TEN_MATCH.winsToTakeEncounter;

export function matchFormat(number: number): MatchFormatEntry {
  const entry = MATCH_FORMAT.find((m) => m.number === number);
  if (!entry) throw new Error(`Unknown match ${number}`);
  return entry;
}
