import { useCallback, useEffect, useMemo } from 'react';
import { useAsync } from './useAsync';
import { useLeague } from '../state/LeagueContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  listDivisionEncounters,
  listDivisionTeams,
  listEncounterGames,
  listRounds,
} from '../data/leagueRepository';
import { subscribeToEncounterSet } from '../data/encounterRepository';
import { computeStandings, isOfficial, type StandingsTeam } from '../domain/standings';
import type { EncounterDetail, EncounterGame, LeagueContext, Round, StandingRow, UUID } from '../domain/types';

export interface LeagueData {
  league: LeagueContext;
  teams: StandingsTeam[];
  rounds: Round[];
  encounters: EncounterDetail[];
  games: EncounterGame[];
  /** Derived from officially confirmed encounters – never stored. */
  standings: StandingRow[];
  officialIds: Set<UUID>;
}

/**
 * The current division's schedule, results and derived standings, refreshed in realtime
 * whenever any of its encounters change (including organizer corrections).
 */
export function useLeagueData() {
  const league = useLeague();
  const ctx = league.data ?? null;
  const divisionId = ctx?.division.id ?? null;

  const raw = useAsync(async () => {
    if (!ctx || !isSupabaseConfigured) return null;
    const [teams, rounds, encounters] = await Promise.all([
      listDivisionTeams(ctx.division.id),
      listRounds(ctx.division.id),
      listDivisionEncounters(ctx.division.id),
    ]);
    const games = await listEncounterGames(encounters.map((e) => e.id));
    return { league: ctx, teams, rounds, encounters, games };
  }, [divisionId]);

  const encounterKey = raw.data?.encounters.map((e) => e.id).join(',') ?? '';
  const { reload } = raw;
  useEffect(() => {
    if (!encounterKey) return;
    return subscribeToEncounterSet(encounterKey.split(','), reload);
  }, [encounterKey, reload]);

  const data = useMemo<LeagueData | null | undefined>(() => {
    if (raw.data === undefined) return undefined;
    if (raw.data === null) return null;
    const { teams, encounters, games } = raw.data;
    return {
      ...raw.data,
      standings: computeStandings(teams, encounters, games),
      officialIds: new Set(encounters.filter(isOfficial).map((e) => e.id)),
    };
  }, [raw.data]);

  // A retry must also re-fetch the league itself when that is what failed (e.g. started offline).
  const { error: leagueError, reload: reloadLeague } = league;
  const retry = useCallback(() => {
    if (leagueError) reloadLeague();
    reload();
  }, [leagueError, reloadLeague, reload]);

  // Surface "league still loading" as loading, and league errors as errors. A failed league
  // fetch is NOT "no season": data stays undefined so the error (and retry) is shown.
  return {
    data: league.data === undefined ? undefined : data,
    error: league.error ?? raw.error,
    loading: league.loading || raw.loading,
    reload: retry,
  };
}
