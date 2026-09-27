/**
 * The optional "Bættu við prófílinn þinn" step after a player selects themselves.
 *
 * Shown once per player: a player_profiles row (saved or skipped – skipped is an all-null row)
 * means it was answered, and a per-device flag covers skips that could not reach the server.
 */
import { getPlayerProfile } from '../../data/playerProfileRepository';
import { storage } from '../../lib/storage';
import { createStore } from '../../lib/store';
import type { UUID } from '../../domain/types';

const flagKey = (playerId: UUID) => `btl.profileSetupDone.${playerId}`;

/** Player id whose optional setup should be shown now (null = none). */
export const pendingProfileSetup = createStore<UUID | null>(null);

export function markProfileSetupDone(playerId: UUID): void {
  storage.set(flagKey(playerId), '1');
  if (pendingProfileSetup.get() === playerId) pendingProfileSetup.set(null);
}

/** True when this player has neither saved nor skipped the optional setup. Never throws. */
export async function needsProfileSetup(playerId: UUID): Promise<boolean> {
  if (storage.get(flagKey(playerId))) return false;
  try {
    if (await getPlayerProfile(playerId)) {
      storage.set(flagKey(playerId), '1'); // answered on another device
      return false;
    }
    return true;
  } catch {
    return false; // offline or unavailable: never block the app over an optional step
  }
}
