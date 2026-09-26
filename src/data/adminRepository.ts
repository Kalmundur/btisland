/** Organizer-only data access. Every write is additionally enforced by RLS (is_organizer()). */
import { requireSupabase } from '../lib/supabase';
import type { RoundAccessCode, UUID } from '../domain/types';
import { toRoundAccessCode, type RoundAccessCodeRow } from './mappers';
import { unwrap } from './result';

export type AdminTable =
  | 'clubs'
  | 'teams'
  | 'players'
  | 'team_registrations'
  | 'seasons'
  | 'divisions'
  | 'division_teams'
  | 'rounds'
  | 'encounters';

export type AdminRow = Record<string, unknown>;

/** `select` can embed related rows, e.g. `'*, season:seasons(name)'`. */
export async function listRows(
  table: AdminTable,
  order: ReadonlyArray<{ column: string; ascending?: boolean }>,
  select = '*',
): Promise<AdminRow[]> {
  let query = requireSupabase().from(table).select(select);
  for (const o of order) query = query.order(o.column, { ascending: o.ascending ?? true });
  return unwrap(await query) as unknown as AdminRow[];
}

export async function insertRow(table: AdminTable, values: AdminRow): Promise<void> {
  unwrap(await requireSupabase().from(table).insert(values));
}

/** `match` holds the primary key column(s) of the row to change. */
export async function updateRow(table: AdminTable, match: AdminRow, values: AdminRow): Promise<void> {
  unwrap(await requireSupabase().from(table).update(values).match(match));
}

export async function deleteRow(table: AdminTable, match: AdminRow): Promise<void> {
  unwrap(await requireSupabase().from(table).delete().match(match));
}

/** Rows matching simple equality filters (e.g. all registrations of one player). */
export async function listRowsWhere(
  table: AdminTable,
  match: AdminRow,
  order: ReadonlyArray<{ column: string; ascending?: boolean }> = [],
): Promise<AdminRow[]> {
  let query = requireSupabase().from(table).select('*').match(match);
  for (const o of order) query = query.order(o.column, { ascending: o.ascending ?? true });
  return unwrap(await query) as AdminRow[];
}

/** Creates a team and enters it into its division in one step (a team needs a division). */
export async function createTeam(values: AdminRow): Promise<void> {
  unwrap(
    await requireSupabase().rpc('admin_create_team', {
      p_name: values.name,
      p_club_id: values.club_id,
      p_division_id: values.division_id,
      p_is_active: values.is_active,
      p_is_public: values.is_public,
    }),
  );
}

// Round access codes --------------------------------------------------------------------

export async function listRoundCodes(roundId: UUID): Promise<RoundAccessCode[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('round_access_codes')
      .select('id, round_id, code, is_active, is_dev_seed, created_at, deactivated_at')
      .eq('round_id', roundId)
      .order('created_at', { ascending: false }),
  ) as RoundAccessCodeRow[];
  return rows.map(toRoundAccessCode);
}

/** Deactivates the current code and creates a new one. Joined devices keep their sessions. */
export async function regenerateRoundCode(roundId: UUID): Promise<string> {
  return unwrap(await requireSupabase().rpc('regenerate_round_code', { p_round_id: roundId })) as string;
}

// Match workflow interventions (each writes an audit event server-side) -------------------

export async function adminUnlockLineup(lineupId: UUID, reason: string): Promise<void> {
  unwrap(await requireSupabase().rpc('admin_unlock_lineup', { p_lineup_id: lineupId, p_reason: reason }));
}

export async function adminUnlockDoubles(selectionId: UUID, reason: string): Promise<void> {
  unwrap(await requireSupabase().rpc('admin_unlock_doubles', { p_selection_id: selectionId, p_reason: reason }));
}

export async function adminReopenEncounter(encounterId: UUID, reason: string): Promise<void> {
  unwrap(await requireSupabase().rpc('admin_reopen_encounter', { p_encounter_id: encounterId, p_reason: reason }));
}

export async function adminCorrectGame(
  encounterId: UUID,
  matchNumber: number,
  gameNumber: number,
  homePoints: number,
  awayPoints: number,
  reason: string,
): Promise<void> {
  unwrap(
    await requireSupabase().rpc('admin_correct_game', {
      p_encounter_id: encounterId,
      p_match_number: matchNumber,
      p_game_number: gameNumber,
      p_home_points: homePoints,
      p_away_points: awayPoints,
      p_reason: reason,
    }),
  );
}

export async function adminClearCorrection(encounterId: UUID, matchNumber: number, gameNumber: number, reason: string): Promise<void> {
  unwrap(
    await requireSupabase().rpc('admin_clear_correction', {
      p_encounter_id: encounterId,
      p_match_number: matchNumber,
      p_game_number: gameNumber,
      p_reason: reason,
    }),
  );
}

export type AdminEncounterStatus = 'postponed' | 'cancelled' | 'active';

export async function adminSetEncounterStatus(encounterId: UUID, status: AdminEncounterStatus, reason: string): Promise<void> {
  unwrap(await requireSupabase().rpc('admin_set_encounter_status', { p_encounter_id: encounterId, p_status: status, p_reason: reason }));
}

export interface GameCorrection {
  matchNumber: number;
  gameNumber: number;
  homePoints: number;
  awayPoints: number;
  reason: string | null;
  createdAt: string;
}

export async function listGameCorrections(encounterId: UUID): Promise<GameCorrection[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('game_corrections')
      .select('match_number, game_number, home_points, away_points, reason, created_at')
      .eq('encounter_id', encounterId)
      .order('match_number')
      .order('game_number'),
  ) as Array<{ match_number: number; game_number: number; home_points: number; away_points: number; reason: string | null; created_at: string }>;
  return rows.map((r) => ({
    matchNumber: r.match_number,
    gameNumber: r.game_number,
    homePoints: r.home_points,
    awayPoints: r.away_points,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export interface AuditEvent {
  id: number;
  action: string;
  entityTable: string;
  actorUserId: string | null;
  createdAt: string;
  details: unknown;
}

/**
 * Full history of one encounter: explicit organizer events plus every row change of the
 * encounter and its child tables (lineups, entries, confirmations, corrections).
 */
export async function listEncounterAudit(encounterId: UUID, limit = 200): Promise<AuditEvent[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('audit_log')
      .select('id, action, entity_table, actor_user_id, created_at, details')
      .or(
        ['entity_id', 'details->>encounter_id', 'details->new->>encounter_id', 'details->old->>encounter_id']
          .map((column) => `${column}.eq.${encounterId}`)
          .join(','),
      )
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as Array<{ id: number; action: string; entity_table: string; actor_user_id: string | null; created_at: string; details: unknown }>;
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityTable: r.entity_table,
    actorUserId: r.actor_user_id,
    createdAt: r.created_at,
    details: r.details,
  }));
}

export async function deactivateRoundCode(codeId: UUID): Promise<void> {
  unwrap(
    await requireSupabase()
      .from('round_access_codes')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', codeId),
  );
}
