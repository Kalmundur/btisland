/** Joining rounds with an access code and reading this device's round sessions. */
import { requireSupabase } from '../lib/supabase';
import type { JoinRoundResult, RoundSession, UUID } from '../domain/types';
import { unwrap } from './result';

interface JoinRoundResponse {
  status: JoinRoundResult['status'];
  round_id?: string;
  encounter_id?: string;
  team_id?: string;
  choices?: Array<{ encounter_id: string; team_id: string }>;
}

export function mapJoinRoundResponse(r: JoinRoundResponse): JoinRoundResult {
  switch (r.status) {
    case 'joined':
      return { status: 'joined', roundId: r.round_id!, encounterId: r.encounter_id!, teamId: r.team_id! };
    case 'choose':
      return {
        status: 'choose',
        roundId: r.round_id!,
        choices: (r.choices ?? []).map((c) => ({ encounterId: c.encounter_id, teamId: c.team_id })),
      };
    default:
      return { status: r.status };
  }
}

export async function joinRound(code: string, encounterId?: UUID): Promise<JoinRoundResult> {
  const data = unwrap(
    await requireSupabase().rpc('join_round', { p_code: code, p_encounter_id: encounterId ?? null }),
  ) as JoinRoundResponse;
  return mapJoinRoundResponse(data);
}

export async function listMySessions(authUserId: UUID): Promise<RoundSession[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('round_sessions')
      .select('id, round_id, encounter_id, team_id, player_id, joined_at, round:rounds(round_date)')
      .eq('auth_user_id', authUserId)
      .order('joined_at', { ascending: false })
      .limit(20),
  ) as unknown as Array<{
    id: string;
    round_id: string;
    encounter_id: string;
    team_id: string;
    player_id: string;
    joined_at: string;
    round: { round_date: string } | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    roundId: r.round_id,
    encounterId: r.encounter_id,
    teamId: r.team_id,
    playerId: r.player_id,
    joinedAt: r.joined_at,
    roundDate: r.round?.round_date ?? '1970-01-01',
  }));
}

export async function leaveRound(sessionId: UUID): Promise<void> {
  unwrap(await requireSupabase().from('round_sessions').delete().eq('id', sessionId));
}
