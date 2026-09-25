/**
 * Encounter internals: lineups, reconciled set state, games and realtime updates.
 * RLS decides what each caller can see (hidden lineups, private raw entries).
 */
import { requireSupabase } from '../lib/supabase';
import type { EncounterGame, Lineup, ReconciledSetState, UUID } from '../domain/types';
import {
  toEncounterGame,
  toLineup,
  toSetState,
  type EncounterGameRow,
  type LineupRow,
  type SetStateRow,
} from './mappers';
import { unwrap } from './result';

export async function listVisibleLineups(encounterId: UUID): Promise<Lineup[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('lineups')
      .select('id, encounter_id, team_id, side, submitted_at, slots:lineup_slots(slot, player_id)')
      .eq('encounter_id', encounterId),
  ) as unknown as LineupRow[];
  return rows.map(toLineup);
}

export async function listSetStates(encounterId: UUID): Promise<ReconciledSetState[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('reconciled_set_states')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('game_number')
      .order('set_number'),
  ) as SetStateRow[];
  return rows.map(toSetState);
}

export async function listGames(encounterId: UUID): Promise<EncounterGame[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('encounter_games')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('game_number'),
  ) as EncounterGameRow[];
  return rows.map(toEncounterGame);
}

// Player write actions (validated server-side by SECURITY DEFINER RPCs) ------------------

export async function submitLineup(encounterId: UUID, slots: Record<string, UUID>): Promise<UUID> {
  return unwrap(
    await requireSupabase().rpc('submit_lineup', { p_encounter_id: encounterId, p_slots: slots }),
  ) as UUID;
}

export async function submitSetEntry(
  encounterId: UUID,
  gameNumber: number,
  setNumber: number,
  homePoints: number,
  awayPoints: number,
): Promise<ReconciledSetState['status']> {
  return unwrap(
    await requireSupabase().rpc('submit_set_entry', {
      p_encounter_id: encounterId,
      p_game_number: gameNumber,
      p_set_number: setNumber,
      p_home_points: homePoints,
      p_away_points: awayPoints,
    }),
  ) as ReconciledSetState['status'];
}

export async function confirmResult(encounterId: UUID): Promise<string> {
  return unwrap(await requireSupabase().rpc('confirm_result', { p_encounter_id: encounterId })) as string;
}

// Realtime ----------------------------------------------------------------------------------

const REALTIME_TABLES = [
  { table: 'encounters', column: 'id' },
  { table: 'lineups', column: 'encounter_id' },
  { table: 'doubles_selections', column: 'encounter_id' },
  { table: 'encounter_games', column: 'encounter_id' },
  { table: 'reconciled_set_states', column: 'encounter_id' },
  { table: 'result_confirmations', column: 'encounter_id' },
] as const;

/**
 * Calls `onChange` whenever anything about the encounter changes. Consumers refetch
 * (single source of truth = database) instead of patching local state from payloads.
 */
export function subscribeToEncounter(encounterId: UUID, onChange: () => void): () => void {
  const client = requireSupabase();
  let channel = client.channel(`encounter:${encounterId}`);
  for (const { table, column } of REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `${column}=eq.${encounterId}` },
      onChange,
    );
  }
  channel.subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
