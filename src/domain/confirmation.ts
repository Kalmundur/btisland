import type { ResultConfirmation, TeamSelection, TeamSide, UUID } from './types';

/** Two DIFFERENT players from the same team must confirm the same version. */
export const REQUIRED_CONFIRMATIONS = 2;

export type SelectionStage = 'missing' | 'pending' | 'locked';

export interface SelectionProgress {
  stage: SelectionStage;
  /** Distinct players who confirmed the current version. */
  count: number;
  iConfirmed: boolean;
  canConfirm: boolean;
}

/** Distinct confirmers of the selection's CURRENT version (older versions never count). */
export function currentConfirmers(selection: Pick<TeamSelection, 'version' | 'confirmations'>): UUID[] {
  return [...new Set(selection.confirmations.filter((c) => c.version === selection.version).map((c) => c.playerId))];
}

/**
 * Progress for display. Uses the server's confirmedCount when the confirmation rows are
 * hidden (opponent before reveal), otherwise counts distinct current-version confirmers.
 */
export function selectionProgress(selection: TeamSelection | undefined, myPlayerId: UUID | null): SelectionProgress {
  if (!selection) return { stage: 'missing', count: 0, iConfirmed: false, canConfirm: false };
  const confirmers = currentConfirmers(selection);
  const count = selection.confirmations.length > 0 ? confirmers.length : selection.confirmedCount;
  const locked = selection.lockedAt !== null || count >= REQUIRED_CONFIRMATIONS;
  const iConfirmed = !!myPlayerId && confirmers.includes(myPlayerId);
  return {
    stage: locked ? 'locked' : 'pending',
    count: Math.min(count, REQUIRED_CONFIRMATIONS),
    iConfirmed,
    canConfirm: !locked && !iConfirmed && !!myPlayerId,
  };
}

export interface ResultConfirmationState {
  home: ResultConfirmation | null;
  away: ResultConfirmation | null;
  /** Both teams confirmed exactly the current result. */
  official: boolean;
}

/** A confirmation only counts for the result it vouched for (same hash, not invalidated). */
export function resultConfirmationState(
  confirmations: readonly ResultConfirmation[],
  currentHash: string | null,
): ResultConfirmationState {
  const valid = (side: TeamSide) =>
    confirmations.find((c) => c.side === side && !c.invalidatedAt && !!currentHash && c.resultHash === currentHash) ?? null;
  const home = valid('home');
  const away = valid('away');
  return { home, away, official: !!home && !!away };
}
