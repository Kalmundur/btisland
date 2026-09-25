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
 * Official regular-season order (mirrors public.match_format).
 * Phase 1: matches 1–6 (concurrent, two tables). Phase 2: doubles. Phase 3: matches 8–10.
 */
export const MATCH_FORMAT: readonly MatchFormatEntry[] = [
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
];

export const MATCH_COUNT = MATCH_FORMAT.length;
export const DOUBLES_MATCH = 7;
/** First team to this many individual wins takes the encounter. */
export const WINS_TO_TAKE_ENCOUNTER = 6;

export function matchFormat(number: number): MatchFormatEntry {
  const entry = MATCH_FORMAT.find((m) => m.number === number);
  if (!entry) throw new Error(`Unknown match ${number}`);
  return entry;
}
