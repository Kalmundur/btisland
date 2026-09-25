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
      .select('id, season_id, name, sort_order')
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
  const row = unwrap(
    await db().from('encounters').select(ENCOUNTER_DETAIL_SELECT).eq('id', encounterId).maybeSingle(),
  ) as unknown as EncounterDetailRow | null;
  return row ? toEncounterDetail(row) : null;
}

export async function listTeamEncounters(teamId: UUID): Promise<EncounterDetail[]> {
  const rows = unwrap(
    await db()
      .from('encounters')
      .select(ENCOUNTER_DETAIL_SELECT)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`),
  ) as unknown as EncounterDetailRow[];
  return rows.map(toEncounterDetail).sort((a, b) => a.round.date.localeCompare(b.round.date) || byRoundThenHome(a, b));
}

export async function getTeam(teamId: UUID): Promise<(Team & { club: Club | null }) | null> {
  const row = unwrap(
    await db()
      .from('teams')
      .select('id, club_id, name, is_public, club:clubs(id, name, short_name, is_public)')
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
  const row = unwrap(
    await db().from('players').select(PLAYER_LIST_SELECT).eq('id', playerId).maybeSingle(),
  ) as unknown as PlayerWithRegistrationsRow | null;
  return row ? toPlayerListItem(row, seasonId) : null;
}

export async function listTeamPlayers(teamId: UUID, seasonId: UUID): Promise<PlayerListItem[]> {
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

/** Decided games of the given encounters (input for player rankings). */
export async function listDecidedGames(encounterIds: UUID[]): Promise<EncounterGame[]> {
  if (encounterIds.length === 0) return [];
  const rows = unwrap(
    await db()
      .from('encounter_games')
      .select('*')
      .in('encounter_id', encounterIds)
      .not('winner', 'is', null),
  ) as EncounterGameRow[];
  return rows.map(toEncounterGame);
}
