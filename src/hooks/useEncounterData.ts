import { useEffect, useMemo } from 'react';
import { useAsync } from './useAsync';
import { getEncounter, getPlayerNames } from '../data/leagueRepository';
import {
  listConflictConfirmations,
  listDoubles,
  listLineups,
  listReconciledGames,
  listResultConfirmations,
  listSetEntries,
  subscribeToEncounter,
} from '../data/encounterRepository';
import { deriveEncounter, type EncounterState } from '../domain/encounterState';
import type {
  ConflictConfirmation,
  DoublesSelection,
  EncounterDetail,
  Lineup,
  ReconciledGame,
  ResultConfirmation,
  SetEntry,
} from '../domain/types';

export interface EncounterData {
  encounter: EncounterDetail | null;
  lineups: Lineup[];
  doubles: DoublesSelection[];
  reconciled: ReconciledGame[];
  /** Raw entries – only returned to participants/organizers (RLS); [] for the public. */
  entries: SetEntry[];
  /** Player resolutions of conflicted games – like `entries`, only for participants/organizers. */
  conflictConfirmations: ConflictConfirmation[];
  confirmations: ResultConfirmation[];
  names: Record<string, string>;
}

/**
 * Everything a match screen needs, refetched on any realtime change to the encounter.
 * `withEntries` = also load raw per-scorer entries (scorecard/admin).
 */
export function useEncounterData(encounterId: string, options: { withEntries?: boolean } = {}) {
  const withEntries = options.withEntries ?? false;
  const state = useAsync<EncounterData>(async () => {
    const [encounter, lineups, doubles, reconciled, entries, conflictConfirmations, confirmations] = await Promise.all([
      getEncounter(encounterId),
      listLineups(encounterId),
      listDoubles(encounterId),
      listReconciledGames(encounterId),
      withEntries ? listSetEntries(encounterId) : Promise.resolve([]),
      withEntries ? listConflictConfirmations(encounterId) : Promise.resolve([]),
      listResultConfirmations(encounterId),
    ]);
    const ids = [
      ...lineups.flatMap((l) => l.slots.map((s) => s.playerId)),
      ...lineups.flatMap((l) => l.confirmations.map((c) => c.playerId)),
      ...doubles.flatMap((d) => [...d.playerIds, ...d.confirmations.map((c) => c.playerId)]),
      ...entries.map((e) => e.submittedByPlayerId),
      ...conflictConfirmations.map((c) => c.playerId),
      ...confirmations.map((c) => c.playerId),
    ];
    return { encounter, lineups, doubles, reconciled, entries, conflictConfirmations, confirmations, names: await getPlayerNames(ids) };
  }, [encounterId, withEntries]);

  const { reload } = state;
  useEffect(() => subscribeToEncounter(encounterId, reload), [encounterId, reload]);

  return state;
}

/** Derived match state (phases, statuses, team score) from the loaded data. */
export function useDerivedEncounter(data: EncounterData | undefined): EncounterState | null {
  return useMemo(() => {
    if (!data?.encounter) return null;
    return deriveEncounter({
      lineupsRevealed: !!data.encounter.lineupsRevealedAt,
      doublesRevealed: !!data.encounter.doublesRevealedAt,
      games: data.reconciled,
    });
  }, [data]);
}

/** Player ids taking part in each match (only known after the reveals). */
export function matchParticipants(data: EncounterData, matchNumber: number, homeSlot: string | null, awaySlot: string | null) {
  const slot = (side: 'home' | 'away', letter: string | null) =>
    data.lineups.find((l) => l.side === side)?.slots.find((s) => s.slot === letter)?.playerId;
  if (matchNumber === 7) {
    return {
      home: data.encounter?.doublesRevealedAt ? (data.doubles.find((d) => d.side === 'home')?.playerIds ?? []) : [],
      away: data.encounter?.doublesRevealedAt ? (data.doubles.find((d) => d.side === 'away')?.playerIds ?? []) : [],
    };
  }
  const h = data.encounter?.lineupsRevealedAt ? slot('home', homeSlot) : undefined;
  const a = data.encounter?.lineupsRevealedAt ? slot('away', awaySlot) : undefined;
  return { home: h ? [h] : [], away: a ? [a] : [] };
}
