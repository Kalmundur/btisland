/**
 * Supabase row shapes (snake_case) and mappers to domain types.
 * Replace the Row interfaces with `supabase gen types typescript` output when the schema settles.
 */
import type {
  Club,
  Division,
  Encounter,
  EncounterDetail,
  EncounterGame,
  EncounterStatus,
  Lineup,
  LineupSlotLetter,
  ReconciledSetState,
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
  short_name: string;
  is_public: boolean;
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
}
export interface TeamRow {
  id: string;
  club_id: string;
  name: string;
  is_public: boolean;
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
}
export interface EncounterDetailRow extends EncounterRow {
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  round: RoundRow;
}
export interface LineupRow {
  id: string;
  encounter_id: string;
  team_id: string;
  side: TeamSide;
  submitted_at: string;
  slots: Array<{ slot: LineupSlotLetter; player_id: string }>;
}
export interface SetStateRow {
  encounter_id: string;
  game_number: number;
  set_number: number;
  status: SetStateStatus;
  home_points: number | null;
  away_points: number | null;
}
export interface EncounterGameRow {
  id: string;
  encounter_id: string;
  game_number: number;
  kind: 'singles' | 'doubles';
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_sets: number;
  away_sets: number;
  winner: TeamSide | null;
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
  'id, round_id, home_team_id, away_team_id, status, home_score, away_score, lineups_revealed_at, doubles_revealed_at';
export const ENCOUNTER_DETAIL_SELECT = `${ENCOUNTER_COLUMNS},
  home_team:teams!encounters_home_team_id_fkey(name),
  away_team:teams!encounters_away_team_id_fkey(name),
  round:rounds(${ROUND_COLUMNS})`;

export const toClub = (r: ClubRow): Club => ({
  id: r.id,
  name: r.name,
  shortName: r.short_name,
  isPublic: r.is_public,
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
});

export const toTeam = (r: TeamRow): Team => ({
  id: r.id,
  clubId: r.club_id,
  name: r.name,
  isPublic: r.is_public,
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
});

export const toEncounterDetail = (r: EncounterDetailRow): EncounterDetail => ({
  ...toEncounter(r),
  homeTeamName: r.home_team?.name ?? '',
  awayTeamName: r.away_team?.name ?? '',
  round: toRound(r.round),
});

export const toLineup = (r: LineupRow): Lineup => ({
  id: r.id,
  encounterId: r.encounter_id,
  teamId: r.team_id,
  side: r.side,
  submittedAt: r.submitted_at,
  slots: [...r.slots]
    .map((s) => ({ slot: s.slot, playerId: s.player_id }))
    .sort((a, b) => a.slot.localeCompare(b.slot)),
});

export const toSetState = (r: SetStateRow): ReconciledSetState => ({
  encounterId: r.encounter_id,
  gameNumber: r.game_number,
  setNumber: r.set_number,
  status: r.status,
  homePoints: r.home_points,
  awayPoints: r.away_points,
});

const present = (ids: Array<string | null>): string[] => ids.filter((id): id is string => !!id);

export const toEncounterGame = (r: EncounterGameRow): EncounterGame => ({
  id: r.id,
  encounterId: r.encounter_id,
  gameNumber: r.game_number,
  kind: r.kind,
  homePlayerIds: present([r.home_player1_id, r.home_player2_id]),
  awayPlayerIds: present([r.away_player1_id, r.away_player2_id]),
  homeSets: r.home_sets,
  awaySets: r.away_sets,
  winner: r.winner,
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
