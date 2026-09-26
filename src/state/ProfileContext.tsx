import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useLeague } from './LeagueContext';
import { clearServerProfile, getServerProfile, localProfile, saveServerProfile } from '../data/profileRepository';
import { leaveAllRounds } from '../data/roundRepository';
import { getPlayer } from '../data/leagueRepository';
import { useAsync } from '../hooks/useAsync';
import { scoreOutbox } from '../offline/scoreSync';
import { scoreDrafts, scorecardRoute } from '../features/scorecard/scorecardMemory';
import type { PlayerListItem, UUID } from '../domain/types';

interface ProfileState {
  /** The selected official player's id (never a typed name). */
  playerId: UUID | null;
  /** Display data, always read from the database. */
  player: PlayerListItem | null;
  /** True until the server mapping has been reconciled with the local cache. */
  syncing: boolean;
  selectPlayer: (playerId: UUID) => Promise<void>;
  /**
   * Device logout: forgets this device's player choice and leaves its joined rounds.
   * The player record, registrations and all scoring history are untouched.
   * Rejects with 'unsynced_scores' while offline score entries still wait to be sent.
   */
  logout: () => Promise<void>;
}

const ProfileCtx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { userId, configured } = useAuth();
  const league = useLeague();
  // Local cache gives an instant answer on startup; the server mapping is reconciled below.
  const [playerId, setPlayerId] = useState<UUID | null>(() => localProfile.get());
  const [syncing, setSyncing] = useState(configured);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const local = localProfile.get();
      const server = await getServerProfile(userId);
      if (local && server !== local) {
        // The device's choice wins (e.g. a new anonymous user after sign-out).
        await saveServerProfile(userId, local);
      } else if (!local && server) {
        localProfile.set(server);
        if (active) setPlayerId(server);
      }
    })()
      .catch(() => undefined)
      .finally(() => active && setSyncing(false));
    return () => {
      active = false;
    };
  }, [userId]);

  const seasonId = league.data?.season.id ?? null;
  const { data: player } = useAsync(
    () => (playerId && configured ? getPlayer(playerId, seasonId) : Promise.resolve(null)),
    [playerId, seasonId, configured],
  );

  const selectPlayer = useCallback(
    async (id: UUID) => {
      if (!userId) throw new Error('No auth session');
      await saveServerProfile(userId, id);
      localProfile.set(id);
      setPlayerId(id);
    },
    [userId],
  );

  const logout = useCallback(async () => {
    // Queued offline scores are sent with this device's round session: never drop them.
    await scoreOutbox.flush();
    if (scoreOutbox.getSnapshot().pending.length > 0) throw new Error('unsynced_scores');
    if (userId) {
      await leaveAllRounds(userId);
      await clearServerProfile(userId);
    }
    localProfile.clear();
    scorecardRoute.set('/scorecard');
    scoreDrafts.clearAll();
    scoreOutbox.dismissAllRejections();
    setPlayerId(null);
  }, [userId]);

  const value = useMemo<ProfileState>(
    () => ({ playerId, player: player ?? null, syncing: syncing && !playerId, selectPlayer, logout }),
    [playerId, player, syncing, selectPlayer, logout],
  );

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
