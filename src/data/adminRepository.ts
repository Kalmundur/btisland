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

export async function deactivateRoundCode(codeId: UUID): Promise<void> {
  unwrap(
    await requireSupabase()
      .from('round_access_codes')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', codeId),
  );
}
