/**
 * Encounter internals: lineups, doubles, reconciled games, raw entries, confirmations,
 * player RPCs and realtime. RLS decides what each caller can see (hidden lineups/doubles,
 * raw entries only for participants).
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { requireSupabase } from '../lib/supabase';
import { reportChannel } from '../lib/connectivity';
import type {
  DoublesSelection,
  Lineup,
  LineupSlotLetter,
  ReconciledGame,
  ResultConfirmation,
  SetEntry,
  UUID,
} from '../domain/types';
import {
  DOUBLES_SELECT,
  LINEUP_SELECT,
  toDoubles,
  toLineup,
  toReconciledGame,
  toResultConfirmation,
  toSetEntry,
  type DoublesRow,
  type LineupRow,
  type ResultConfirmationRow,
  type SetEntryRow,
  type SetStateRow,
} from './mappers';
import { unwrap } from './result';

const db = () => requireSupabase();

// Reads ------------------------------------------------------------------------------------

export async function listLineups(encounterId: UUID): Promise<Lineup[]> {
  const rows = unwrap(await db().from('lineups').select(LINEUP_SELECT).eq('encounter_id', encounterId)) as unknown as LineupRow[];
  return rows.map(toLineup);
}

export async function listDoubles(encounterId: UUID): Promise<DoublesSelection[]> {
  const rows = unwrap(
    await db().from('doubles_selections').select(DOUBLES_SELECT).eq('encounter_id', encounterId),
  ) as unknown as DoublesRow[];
  return rows.map(toDoubles);
}

export async function listReconciledGames(encounterId: UUID): Promise<ReconciledGame[]> {
  const rows = unwrap(
    await db()
      .from('reconciled_set_states')
      .select('encounter_id, match_number, game_number, status, home_points, away_points, submitter_count')
      .eq('encounter_id', encounterId),
  ) as SetStateRow[];
  return rows.map(toReconciledGame);
}

/** Raw per-scorer entries. Only participants of the encounter (and organizers) get rows. */
export async function listSetEntries(encounterId: UUID): Promise<SetEntry[]> {
  const rows = unwrap(
    await db()
      .from('set_entries')
      .select('id, encounter_id, match_number, game_number, side, home_points, away_points, submitted_by_player_id, client_entry_id, updated_at')
      .eq('encounter_id', encounterId),
  ) as SetEntryRow[];
  return rows.map(toSetEntry);
}

export async function listResultConfirmations(encounterId: UUID): Promise<ResultConfirmation[]> {
  const rows = unwrap(
    await db()
      .from('result_confirmations')
      .select('id, encounter_id, side, player_id, result_hash, result_version, created_at, invalidated_at')
      .eq('encounter_id', encounterId)
      .order('created_at'),
  ) as ResultConfirmationRow[];
  return rows.map(toResultConfirmation);
}

// Player actions (all validated server-side) --------------------------------------------------

export interface SelectionResult {
  version: number;
  confirmedCount: number;
  locked: boolean;
}

const toSelectionResult = (r: { version: number; confirmed_count: number; locked: boolean }): SelectionResult => ({
  version: r.version,
  confirmedCount: r.confirmed_count,
  locked: r.locked,
});

export async function proposeLineup(encounterId: UUID, slots: Partial<Record<LineupSlotLetter, UUID>>): Promise<SelectionResult> {
  return toSelectionResult(unwrap(await db().rpc('propose_lineup', { p_encounter_id: encounterId, p_slots: slots })));
}

export async function confirmLineup(lineupId: UUID, version: number): Promise<SelectionResult> {
  return toSelectionResult(unwrap(await db().rpc('confirm_lineup', { p_lineup_id: lineupId, p_version: version })));
}

export async function proposeDoubles(encounterId: UUID, player1: UUID, player2: UUID): Promise<SelectionResult> {
  return toSelectionResult(
    unwrap(await db().rpc('propose_doubles', { p_encounter_id: encounterId, p_player1: player1, p_player2: player2 })),
  );
}

export async function confirmDoubles(selectionId: UUID, version: number): Promise<SelectionResult> {
  return toSelectionResult(unwrap(await db().rpc('confirm_doubles', { p_selection_id: selectionId, p_version: version })));
}

export async function confirmResult(encounterId: UUID, resultHash: string): Promise<string> {
  return unwrap(await db().rpc('confirm_result', { p_encounter_id: encounterId, p_result_hash: resultHash })) as string;
}

export interface GameScoreSubmission {
  clientEntryId: UUID;
  encounterId: UUID;
  matchNumber: number;
  gameNumber: number;
  homePoints: number;
  awayPoints: number;
}

export type SubmitOutcome =
  | { ok: true }
  | { ok: false; retryable: boolean; error: string };

/** Connectivity problems are retryable; anything the database raised is a final answer. */
export function classifySubmitError(error: Pick<PostgrestError, 'code' | 'message'>, online: boolean): SubmitOutcome {
  const network = !online || !error.code || /fetch|network|timeout|load failed/i.test(error.message);
  const authRefresh = error.code?.startsWith('PGRST3') ?? false; // expired JWT: retry after refresh
  return { ok: false, retryable: network || authRefresh, error: error.message };
}

/** Idempotent by clientEntryId – safe to call again with the same id after a lost response. */
export async function submitGameScore(s: GameScoreSubmission): Promise<SubmitOutcome> {
  const { error } = await db().rpc('submit_game_score', {
    p_client_entry_id: s.clientEntryId,
    p_encounter_id: s.encounterId,
    p_match_number: s.matchNumber,
    p_game_number: s.gameNumber,
    p_home_points: s.homePoints,
    p_away_points: s.awayPoints,
  });
  if (!error) return { ok: true };
  return classifySubmitError(error, typeof navigator === 'undefined' ? true : navigator.onLine);
}

// Realtime ----------------------------------------------------------------------------------

/** While a channel is down, refetch on this interval so screens never go stale silently. */
const FALLBACK_POLL_MS = 15_000;
let channelSeq = 0;

interface Binding {
  table: string;
  filter: string;
}

/**
 * Opens one channel for the given table filters. Every change (and every (re)subscribe,
 * since events may have been missed) triggers one debounced `onChange` – consumers refetch,
 * the database stays the single source of truth. Channel health is reported for the UI.
 */
function watch(label: string, bindings: readonly Binding[], onChange: () => void, debounceMs: number): () => void {
  const client = requireSupabase();
  const name = `${label}:${++channelSeq}`; // unique: several screens may watch the same rows
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => !closed && onChange(), debounceMs);
  };

  let channel = client.channel(name);
  for (const { table, filter } of bindings) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, fire);
  }
  channel.subscribe((status) => {
    if (closed) return;
    if (status === 'SUBSCRIBED') {
      clearInterval(poll);
      poll = undefined;
      reportChannel(name, true);
      fire();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      reportChannel(name, false);
      poll ??= setInterval(fire, FALLBACK_POLL_MS);
    }
  });

  return () => {
    closed = true;
    clearTimeout(timer);
    clearInterval(poll);
    reportChannel(name, null);
    void client.removeChannel(channel);
  };
}

const ENCOUNTER_CHILD_TABLES = [
  'lineups',
  'doubles_selections',
  'encounter_games',
  'reconciled_set_states',
  'set_entries',
  'result_confirmations',
] as const;

/** Everything about one encounter (scorecard, public match page, organizer view). */
export function subscribeToEncounter(encounterId: UUID, onChange: () => void, debounceMs = 150): () => void {
  return watch(
    `encounter:${encounterId}`,
    [
      { table: 'encounters', filter: `id=eq.${encounterId}` },
      ...ENCOUNTER_CHILD_TABLES.map((table) => ({ table, filter: `encounter_id=eq.${encounterId}` })),
    ],
    onChange,
    debounceMs,
  );
}

/** A set of encounters (a division, a round, a dashboard): status, score, conflicts, confirmations. */
export function subscribeToEncounterSet(encounterIds: readonly UUID[], onChange: () => void, debounceMs = 300): () => void {
  if (encounterIds.length === 0) return () => undefined;
  // Realtime "in" filters accept up to 100 values; a division has far fewer encounters.
  const ids = `(${encounterIds.slice(0, 100).join(',')})`;
  return watch(
    'encounters',
    [
      { table: 'encounters', filter: `id=in.${ids}` },
      ...['encounter_games', 'reconciled_set_states', 'result_confirmations', 'lineups', 'doubles_selections'].map((table) => ({
        table,
        filter: `encounter_id=in.${ids}`,
      })),
    ],
    onChange,
    debounceMs,
  );
}
