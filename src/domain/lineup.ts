import type { LineupSlotLetter, TeamSide, UUID } from './types';

/** Home team ("Lið 1") plays A/B/C, away team plays X/Y/Z. */
export const SLOT_LETTERS: Record<TeamSide, readonly LineupSlotLetter[]> = {
  home: ['A', 'B', 'C'],
  away: ['X', 'Y', 'Z'],
};

export function slotsForSide(side: TeamSide): readonly LineupSlotLetter[] {
  return SLOT_LETTERS[side];
}

export function sideForSlot(slot: LineupSlotLetter): TeamSide {
  return SLOT_LETTERS.home.includes(slot) ? 'home' : 'away';
}

export type LineupDraft = Partial<Record<LineupSlotLetter, UUID>>;

export type LineupValidationError = 'incomplete' | 'wrong_side' | 'duplicate_player';

export type DoublesValidationError = 'incomplete' | 'duplicate_player' | 'not_on_roster';

/** Two different players from the team roster (they need not be in the singles lineup). */
export function validateDoubles(
  pair: ReadonlyArray<UUID | undefined>,
  roster: ReadonlyArray<UUID>,
): DoublesValidationError | null {
  if (pair.length !== 2 || pair.some((p) => !p)) return 'incomplete';
  if (pair[0] === pair[1]) return 'duplicate_player';
  if (pair.some((p) => !roster.includes(p!))) return 'not_on_roster';
  return null;
}

/** Mirrors the server-side checks in propose_lineup() so the UI can give instant feedback. */
export function validateLineup(side: TeamSide, draft: LineupDraft): LineupValidationError | null {
  const letters = Object.keys(draft) as LineupSlotLetter[];
  if (letters.some((l) => sideForSlot(l) !== side)) return 'wrong_side';
  const players = SLOT_LETTERS[side].map((l) => draft[l]);
  if (players.some((p) => !p)) return 'incomplete';
  if (new Set(players).size !== players.length) return 'duplicate_player';
  return null;
}
