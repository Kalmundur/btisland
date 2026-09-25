import { useEffect } from 'react';
import { useAsync } from './useAsync';
import { getEncounter, getPlayerNames } from '../data/leagueRepository';
import { listGames, listVisibleLineups, subscribeToEncounter } from '../data/encounterRepository';
import type { EncounterDetail, EncounterGame, Lineup } from '../domain/types';

export interface EncounterData {
  encounter: EncounterDetail | null;
  lineups: Lineup[];
  games: EncounterGame[];
  names: Record<string, string>;
}

/** Everything a match screen needs, refetched whenever realtime reports a change. */
export function useEncounterData(encounterId: string) {
  const state = useAsync<EncounterData>(async () => {
    const [encounter, lineups, games] = await Promise.all([
      getEncounter(encounterId),
      listVisibleLineups(encounterId),
      listGames(encounterId),
    ]);
    const ids = [
      ...lineups.flatMap((l) => l.slots.map((s) => s.playerId)),
      ...games.flatMap((g) => [...g.homePlayerIds, ...g.awayPlayerIds]),
    ];
    return { encounter, lineups, games, names: await getPlayerNames(ids) };
  }, [encounterId]);

  const { reload } = state;
  useEffect(() => subscribeToEncounter(encounterId, reload), [encounterId, reload]);

  return state;
}
