/**
 * Supabase row shapes (snake_case) and mappers to domain types.
 * Replace the Row interfaces with `supabase gen types typescript` output when the schema settles.
 */
import type {
  ConflictConfirmation,
  Club,
  Division,
  Encounter,
  EncounterDetail,
  EncounterGame,
  EncounterStatus,
  DoublesSelection,
  Lineup,
  LineupSlotLetter,
  MatchStatus,
  ReconciledGame,
  ResultConfirmation,
  SetEntry,
  Round,
  RoundAccessCode,
  Season,
  SetStateStatus,
  Team,
  TeamSide,
} from '../domain/types';

export interface ClubRow {
  id: string;
  name: string;
  short_name: string | null;
  is_public: boolean;
  is_active: boolean;
  logo_url: string | null;
}
export interface SeasonRow {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
}
export interface DivisionRow {
  id: string;
  season_id: string;
  name: string;
  sort_order: number;
  format_key: string;
}
export interface TeamRow {
  id: string;
  club_id: string;
  name: string;
  is_public: boolean;
  is_active: boolean;
}
export interface RoundRow {
  id: string;
  division_id: string;
  number: number;
  round_date: string;
  start_time: string | null;
  venue: string | null;
}
export interface EncounterRow {
  id: string;
  round_id: string;
  home_team_id: string;
  away_team_id: string;
  status: EncounterStatus;
  home_score: number | null;
  away_score: number | null;
  lineups_revealed_at: string | null;
  doubles_revealed_at: string | null;
  result_hash: string | null;
  result_version: number;
}
export interface EncounterDetailRow extends EncounterRow {
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  round: RoundRow;
}
interface SelectionRowBase {
  id: string;
  encounter_id: string;
  team_id: string;
  side: TeamSide;
  version: number;
  confirmed_count: number;
  locked_at: string | null;
  confirmations: Array<{ player_id: string; version: number }>;
}
export interface LineupRow extends SelectionRowBase {
  submitted_at: string;
  slots: Array<{ slot: LineupSlotLetter; player_id: string }>;
}
export interface DoublesRow extends SelectionRowBase {
  players: Array<{ player_id: string; position: number }>;
}
export interface SetStateRow {
  encounter_id: string;
  match_number: number;
  game_number: number;
  status: SetStateStatus;
  home_points: number | null;
  away_points: number | null;
  submitter_count: number;
}
export interface SetEntryRow {
  id: string;
  encounter_id: string;
  match_number: number;
  game_number: number;
  side: TeamSide;
  home_points: number;
  away_points: number;
  submitted_by_player_id: string;
  client_entry_id: string;
  updated_at: string;
}
export interface ConflictConfirmationRow {
  id: string;
  encounter_id: string;
  match_number: number;
  game_number: number;
  side: TeamSide;
  player_id: string;
  home_points: number;
  away_points: number;
  created_at: string;
  superseded_at: string | null;
}
export interface EncounterGameRow {
  id: string;
  encounter_id: string;
  match_number: number;
  kind: 'singles' | 'doubles';
  status: MatchStatus;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_games: number;
  away_games: number;
  winner: TeamSide | null;
}
export interface ResultConfirmationRow {
  id: string;
  encounter_id: string;
  side: TeamSide;
  player_id: string;
  result_hash: string | null;
  result_version: number | null;
  created_at: string;
  invalidated_at: string | null;
}
export interface RoundAccessCodeRow {
  id: string;
  round_id: string;
  code: string;
  is_active: boolean;
  is_dev_seed: boolean;
  created_at: string;
  deactivated_at: string | null;
}

/** Column lists kept next to the mappers so selects and mappers stay in sync. */
export const ROUND_COLUMNS = 'id, division_id, number, round_date, start_time, venue';
export const ENCOUNTER_COLUMNS =
  'id, round_id, home_team_id, away_team_id, status, home_score, away_score, lineups_revealed_at, doubles_revealed_at, result_hash, result_version';
export const ENCOUNTER_DETAIL_SELECT = `${ENCOUNTER_COLUMNS},
  home_team:teams!encounters_home_team_id_fkey(name),
  away_team:teams!encounters_away_team_id_fkey(name),
  round:rounds(${ROUND_COLUMNS})`;

export const toClub = (r: ClubRow): Club => ({
  id: r.id,
  name: r.name,
  shortName: r.short_name,
  isPublic: r.is_public,
  isActive: r.is_active ?? true,
  logoUrl: r.logo_url ?? null,
});

export const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  name: r.name,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  isCurrent: r.is_current,
});

export const toDivision = (r: DivisionRow): Division => ({
  id: r.id,
  seasonId: r.season_id,
  name: r.name,
  sortOrder: r.sort_order,
  formatKey: r.format_key ?? 'REGULAR_TEN_MATCH',
});

export const toTeam = (r: TeamRow): Team => ({
  id: r.id,
  clubId: r.club_id,
  name: r.name,
  isPublic: r.is_public,
  isActive: r.is_active ?? true,
});

export const toRound = (r: RoundRow): Round => ({
  id: r.id,
  divisionId: r.division_id,
  number: r.number,
  date: r.round_date,
  startTime: r.start_time,
  venue: r.venue,
});

export const toEncounter = (r: EncounterRow): Encounter => ({
  id: r.id,
  roundId: r.round_id,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  status: r.status,
  homeScore: r.home_score,
  awayScore: r.away_score,
  lineupsRevealedAt: r.lineups_revealed_at,
  doublesRevealedAt: r.doubles_revealed_at,
  resultHash: r.result_hash,
  resultVersion: r.result_version,
});

export const toEncounterDetail = (r: EncounterDetailRow): EncounterDetail => ({
  ...toEncounter(r),
  homeTeamName: r.home_team?.name ?? '',
  awayTeamName: r.away_team?.name ?? '',
  round: toRound(r.round),
});

const toSelectionBase = (r: SelectionRowBase) => ({
  id: r.id,
  encounterId: r.encounter_id,
  teamId: r.team_id,
  side: r.side,
  version: r.version,
  confirmedCount: r.confirmed_count,
  lockedAt: r.locked_at,
  confirmations: (r.confirmations ?? []).map((c) => ({ playerId: c.player_id, version: c.version })),
});

export const LINEUP_SELECT =
  'id, encounter_id, team_id, side, version, confirmed_count, locked_at, submitted_at, slots:lineup_slots(slot, player_id), confirmations:lineup_confirmations(player_id, version)';
export const DOUBLES_SELECT =
  'id, encounter_id, team_id, side, version, confirmed_count, locked_at, players:doubles_players(player_id, position), confirmations:doubles_confirmations(player_id, version)';

export const toLineup = (r: LineupRow): Lineup => ({
  ...toSelectionBase(r),
  submittedAt: r.submitted_at,
  slots: [...(r.slots ?? [])]
    .map((s) => ({ slot: s.slot, playerId: s.player_id }))
    .sort((a, b) => a.slot.localeCompare(b.slot)),
});

export const toDoubles = (r: DoublesRow): DoublesSelection => ({
  ...toSelectionBase(r),
  playerIds: [...(r.players ?? [])].sort((a, b) => a.position - b.position).map((p) => p.player_id),
});

export const toReconciledGame = (r: SetStateRow): ReconciledGame => ({
  encounterId: r.encounter_id,
  matchNumber: r.match_number,
  gameNumber: r.game_number,
  status: r.status,
  homePoints: r.home_points,
  awayPoints: r.away_points,
  submitterCount: r.submitter_count,
});

export const toSetEntry = (r: SetEntryRow): SetEntry => ({
  id: r.id,
  encounterId: r.encounter_id,
  matchNumber: r.match_number,
  gameNumber: r.game_number,
  side: r.side,
  homePoints: r.home_points,
  awayPoints: r.away_points,
  submittedByPlayerId: r.submitted_by_player_id,
  clientEntryId: r.client_entry_id,
  updatedAt: r.updated_at,
});

export const toConflictConfirmation = (r: ConflictConfirmationRow): ConflictConfirmation => ({
  id: r.id,
  encounterId: r.encounter_id,
  matchNumber: r.match_number,
  gameNumber: r.game_number,
  side: r.side,
  playerId: r.player_id,
  homePoints: r.home_points,
  awayPoints: r.away_points,
  createdAt: r.created_at,
  supersededAt: r.superseded_at,
});

const present = (ids: Array<string | null>): string[] => ids.filter((id): id is string => !!id);

export const toEncounterGame = (r: EncounterGameRow): EncounterGame => ({
  id: r.id,
  encounterId: r.encounter_id,
  matchNumber: r.match_number,
  kind: r.kind,
  status: r.status,
  homePlayerIds: present([r.home_player1_id, r.home_player2_id]),
  awayPlayerIds: present([r.away_player1_id, r.away_player2_id]),
  homeGames: r.home_games,
  awayGames: r.away_games,
  winner: r.winner,
});

export const toResultConfirmation = (r: ResultConfirmationRow): ResultConfirmation => ({
  id: r.id,
  encounterId: r.encounter_id,
  side: r.side,
  playerId: r.player_id,
  resultHash: r.result_hash,
  resultVersion: r.result_version,
  createdAt: r.created_at,
  invalidatedAt: r.invalidated_at,
});

export const toRoundAccessCode = (r: RoundAccessCodeRow): RoundAccessCode => ({
  id: r.id,
  roundId: r.round_id,
  code: r.code,
  isActive: r.is_active,
  isDevSeed: r.is_dev_seed,
  createdAt: r.created_at,
  deactivatedAt: r.deactivated_at,
});
