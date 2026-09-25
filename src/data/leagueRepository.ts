/** Public league data: seasons, divisions, teams, players, schedule. */
import { requireSupabase } from '../lib/supabase';
import type {
  Club,
  EncounterDetail,
  EncounterGame,
  LeagueContext,
  PlayerListItem,
  Round,
  Team,
  UUID,
} from '../domain/types';
import type { StandingsTeam } from '../domain/standings';
import {
  ENCOUNTER_DETAIL_SELECT,
  ROUND_COLUMNS,
  toClub,
  toDivision,
  toEncounterDetail,
  toEncounterGame,
  toRound,
  toSeason,
  toTeam,
  type ClubRow,
  type DivisionRow,
  type EncounterDetailRow,
  type EncounterGameRow,
  type RoundRow,
  type SeasonRow,
  type TeamRow,
} from './mappers';
import { unwrap } from './result';
import { isUuid } from '../lib/ids';
import type { GameWithContext } from '../domain/playerStats';

const db = () => requireSupabase();

const byRoundThenHome = (a: EncounterDetail, b: EncounterDetail) =>
  a.round.number - b.round.number || a.homeTeamName.localeCompare(b.homeTeamName, 'is');

/** The current season (or the newest) and its first division. */
export async function getCurrentLeague(): Promise<LeagueContext | null> {
  const seasons = unwrap(
    await db()
      .from('seasons')
      .select('id, name, starts_on, ends_on, is_current')
      .order('is_current', { ascending: false })
      .order('starts_on', { ascending: false, nullsFirst: false })
      .limit(1),
  ) as SeasonRow[];
  if (seasons.length === 0) return null;
  const season = toSeason(seasons[0]);

  const divisions = unwrap(
    await db()
      .from('divisions')
      .select('id, season_id, name, sort_order, format_key')
      .eq('season_id', season.id)
      .order('sort_order')
      .limit(1),
  ) as DivisionRow[];
  if (divisions.length === 0) return null;
  return { season, division: toDivision(divisions[0]) };
}

export async function listDivisionTeams(divisionId: UUID): Promise<StandingsTeam[]> {
  const rows = unwrap(
    await db().from('division_teams').select('team:teams(id, name)').eq('division_id', divisionId),
  ) as unknown as Array<{ team: { id: string; name: string } | null }>;
  return rows.flatMap((r) => (r.team ? [{ id: r.team.id, name: r.team.name }] : []));
}

export async function listRounds(divisionId: UUID): Promise<Round[]> {
  const rows = unwrap(
    await db().from('rounds').select(ROUND_COLUMNS).eq('division_id', divisionId).order('number'),
  ) as RoundRow[];
  return rows.map(toRound);
}

export async function getRound(roundId: UUID): Promise<Round | null> {
  if (!isUuid(roundId)) return null;
  const row = unwrap(
    await db().from('rounds').select(ROUND_COLUMNS).eq('id', roundId).maybeSingle(),
  ) as RoundRow | null;
  return row ? toRound(row) : null;
}

export async function listRoundEncounters(roundId: UUID): Promise<EncounterDetail[]> {
  const rows = unwrap(
    await db().from('encounters').select(ENCOUNTER_DETAIL_SELECT).eq('round_id', roundId),
  ) as unknown as EncounterDetailRow[];
  return rows.map(toEncounterDetail).sort(byRoundThenHome);
}

export async function listDivisionEncounters(divisionId: UUID): Promise<EncounterDetail[]> {
  const rounds = await listRounds(divisionId);
  if (rounds.length === 0) return [];
  const rows = unwrap(
    await db()
      .from('encounters')
      .select(ENCOUNTER_DETAIL_SELECT)
      .in(
        'round_id',
        rounds.map((r) => r.id),
      ),
  ) as unknown as EncounterDetailRow[];
  return rows.map(toEncounterDetail).sort(byRoundThenHome);
}

export async function getEncounter(encounterId: UUID): Promise<EncounterDetail | null> {
  if (!isUuid(encounterId)) return null;
  const row = unwrap(
    await db().from('encounters').select(ENCOUNTER_DETAIL_SELECT).eq('id', encounterId).maybeSingle(),
  ) as unknown as EncounterDetailRow | null;
  return row ? toEncounterDetail(row) : null;
}

export async function listTeamEncounters(teamId: UUID): Promise<EncounterDetail[]> {
  if (!isUuid(teamId)) return [];
  const rows = unwrap(
    await db()
      .from('encounters')
      .select(ENCOUNTER_DETAIL_SELECT)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`),
  ) as unknown as EncounterDetailRow[];
  return rows.map(toEncounterDetail).sort((a, b) => a.round.date.localeCompare(b.round.date) || byRoundThenHome(a, b));
}

export async function getTeam(teamId: UUID): Promise<(Team & { club: Club | null }) | null> {
  if (!isUuid(teamId)) return null;
  const row = unwrap(
    await db()
      .from('teams')
      .select('id, club_id, name, is_public, is_active, club:clubs(id, name, short_name, is_public, is_active, logo_url)')
      .eq('id', teamId)
      .maybeSingle(),
  ) as unknown as (TeamRow & { club: ClubRow | null }) | null;
  return row ? { ...toTeam(row), club: row.club ? toClub(row.club) : null } : null;
}

interface PlayerWithRegistrationsRow {
  id: string;
  full_name: string;
  club_id: string;
  club: { name: string } | null;
  registrations: Array<{
    team_id: string;
    season_id: string;
    is_active: boolean;
    team: { name: string } | null;
  }>;
}

const PLAYER_LIST_SELECT =
  'id, full_name, club_id, club:clubs(name), registrations:team_registrations(team_id, season_id, is_active, team:teams(name))';

function toPlayerListItem(row: PlayerWithRegistrationsRow, seasonId: UUID | null): PlayerListItem {
  const reg =
    row.registrations.find((r) => r.is_active && (!seasonId || r.season_id === seasonId)) ?? null;
  return {
    id: row.id,
    fullName: row.full_name,
    clubId: row.club_id,
    clubName: row.club?.name ?? '',
    teamId: reg?.team_id ?? null,
    teamName: reg?.team?.name ?? null,
  };
}

/** All active public players with club and (current season) team, sorted by name. */
export async function listPlayers(seasonId: UUID | null): Promise<PlayerListItem[]> {
  const rows = unwrap(
    await db().from('players').select(PLAYER_LIST_SELECT).eq('is_active', true),
  ) as unknown as PlayerWithRegistrationsRow[];
  const collator = new Intl.Collator('is');
  return rows.map((r) => toPlayerListItem(r, seasonId)).sort((a, b) => collator.compare(a.fullName, b.fullName));
}

export async function getPlayer(playerId: UUID, seasonId: UUID | null): Promise<PlayerListItem | null> {
  if (!isUuid(playerId)) return null;
  const row = unwrap(
    await db().from('players').select(PLAYER_LIST_SELECT).eq('id', playerId).maybeSingle(),
  ) as unknown as PlayerWithRegistrationsRow | null;
  return row ? toPlayerListItem(row, seasonId) : null;
}

export async function listTeamPlayers(teamId: UUID, seasonId: UUID): Promise<PlayerListItem[]> {
  if (!isUuid(teamId)) return [];
  const rows = unwrap(
    await db()
      .from('team_registrations')
      .select('player:players(' + PLAYER_LIST_SELECT + ')')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .eq('is_active', true),
  ) as unknown as Array<{ player: PlayerWithRegistrationsRow | null }>;
  const collator = new Intl.Collator('is');
  return rows
    .flatMap((r) => (r.player ? [toPlayerListItem(r.player, seasonId)] : []))
    .sort((a, b) => collator.compare(a.fullName, b.fullName));
}

/** id -> display name, for rendering lineups and rankings. */
export async function getPlayerNames(ids: readonly UUID[]): Promise<Record<UUID, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const rows = unwrap(
    await db().from('players').select('id, full_name').in('id', unique),
  ) as Array<{ id: string; full_name: string }>;
  return Object.fromEntries(rows.map((r) => [r.id, r.full_name]));
}

/** All derived match rows (encounter_games) of the given encounters. */
export async function listEncounterGames(encounterIds: readonly UUID[]): Promise<EncounterGame[]> {
  if (encounterIds.length === 0) return [];
  const rows = unwrap(
    await db().from('encounter_games').select('*').in('encounter_id', [...encounterIds]),
  ) as EncounterGameRow[];
  return rows.map(toEncounterGame);
}

/** Every match a player took part in, with encounter/round context (for the player page). */
export async function listPlayerGames(playerId: UUID): Promise<GameWithContext[]> {
  if (!isUuid(playerId)) return [];
  const rows = unwrap(
    await db()
      .from('encounter_games')
      .select(
        '*, encounter:encounters!inner(status, home_team:teams!encounters_home_team_id_fkey(name), away_team:teams!encounters_away_team_id_fkey(name), round:rounds(round_date, number))',
      )
      .or(
        ['home_player1_id', 'home_player2_id', 'away_player1_id', 'away_player2_id'].map((c) => `${c}.eq.${playerId}`).join(','),
      ),
  ) as unknown as Array<
    EncounterGameRow & {
      encounter: {
        status: string;
        home_team: { name: string } | null;
        away_team: { name: string } | null;
        round: { round_date: string; number: number } | null;
      };
    }
  >;
  return rows.map((r) => ({
    ...toEncounterGame(r),
    encounterStatus: r.encounter.status,
    roundDate: r.encounter.round?.round_date ?? '',
    roundNumber: r.encounter.round?.number ?? 0,
    homeTeamName: r.encounter.home_team?.name ?? '',
    awayTeamName: r.encounter.away_team?.name ?? '',
  }));
}

/** Number of conflicted games per encounter (public: no scorer details). */
export async function listConflictCounts(encounterIds: readonly UUID[]): Promise<Record<UUID, number>> {
  if (encounterIds.length === 0) return {};
  const rows = unwrap(
    await db()
      .from('reconciled_set_states')
      .select('encounter_id')
      .eq('status', 'conflict')
      .in('encounter_id', [...encounterIds]),
  ) as Array<{ encounter_id: string }>;
  const counts: Record<UUID, number> = {};
  for (const r of rows) counts[r.encounter_id] = (counts[r.encounter_id] ?? 0) + 1;
  return counts;
}

export async function getDivision(divisionId: UUID) {
  if (!isUuid(divisionId)) return null;
  const row = unwrap(
    await db()
      .from('divisions')
      .select('id, season_id, name, sort_order, format_key, season:seasons(id, name, starts_on, ends_on, is_current)')
      .eq('id', divisionId)
      .maybeSingle(),
  ) as unknown as (DivisionRow & { season: SeasonRow | null }) | null;
  return row ? { ...toDivision(row), season: row.season ? toSeason(row.season) : null } : null;
}
