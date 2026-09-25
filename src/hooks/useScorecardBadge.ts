import { useEffect } from 'react';
import { useAsync } from './useAsync';
import { useAuth } from '../state/AuthContext';
import { useProfile } from '../state/ProfileContext';
import { listMySessions } from '../data/roundRepository';
import { getEncounter, listConflictCounts } from '../data/leagueRepository';
import { subscribeToEncounter } from '../data/encounterRepository';
import { pickActiveSession, todayInIceland } from '../domain/activeSession';

export type ScorecardBadge = 'conflict' | 'active' | null;

/**
 * Small Scorecard-tab badge: a joined encounter that is not finished ("active"), or an
 * unresolved conflict in it ("conflict"). `refreshKey` re-checks sessions (e.g. on navigation).
 */
export function useScorecardBadge(refreshKey: string): ScorecardBadge {
  const { userId, configured } = useAuth();
  const { playerId } = useProfile();

  const session = useAsync(
    async () => (configured && userId && playerId ? pickActiveSession(await listMySessions(userId), todayInIceland()) : null),
    [configured, userId, playerId, refreshKey],
  );
  const encounterId = session.data?.encounterId ?? null;

  const state = useAsync(async () => {
    if (!encounterId) return null;
    const [encounter, conflicts] = await Promise.all([getEncounter(encounterId), listConflictCounts([encounterId])]);
    return { status: encounter?.status ?? null, conflicts: conflicts[encounterId] ?? 0 };
  }, [encounterId]);

  const { reload } = state;
  useEffect(() => (encounterId ? subscribeToEncounter(encounterId, reload, 500) : undefined), [encounterId, reload]);

  const s = state.data;
  if (!s || !s.status || s.status === 'completed' || s.status === 'cancelled') return null;
  return s.conflicts > 0 ? 'conflict' : 'active';
}
