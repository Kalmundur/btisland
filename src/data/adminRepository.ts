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

export async function listRows(
  table: AdminTable,
  order: ReadonlyArray<{ column: string; ascending?: boolean }>,
): Promise<AdminRow[]> {
  let query = requireSupabase().from(table).select('*');
  for (const o of order) query = query.order(o.column, { ascending: o.ascending ?? true });
  return unwrap(await query) as AdminRow[];
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

export async function countRows(table: AdminTable): Promise<number> {
  const { count, error } = await requireSupabase().from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
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

export interface AuditEvent {
  id: number;
  action: string;
  entityTable: string;
  createdAt: string;
  details: unknown;
}

export async function listEncounterAudit(encounterId: UUID): Promise<AuditEvent[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('audit_log')
      .select('id, action, entity_table, created_at, details')
      .or(`entity_id.eq.${encounterId},details->>encounter_id.eq.${encounterId}`)
      .in('action', ['reopen_encounter', 'unlock_lineup', 'unlock_doubles'])
      .order('created_at', { ascending: false }),
  ) as Array<{ id: number; action: string; entity_table: string; created_at: string; details: unknown }>;
  return rows.map((r) => ({ id: r.id, action: r.action, entityTable: r.entity_table, createdAt: r.created_at, details: r.details }));
}

export async function deactivateRoundCode(codeId: UUID): Promise<void> {
  unwrap(
    await requireSupabase()
      .from('round_access_codes')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', codeId),
  );
}
