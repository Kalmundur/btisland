/** Domain types. Independent of Supabase row shapes (see src/data/mappers.ts). */

export type UUID = string;
/** ISO date, YYYY-MM-DD */
export type IsoDate = string;

export type TeamSide = 'home' | 'away';

export type EncounterStatus =
  | 'scheduled'
  | 'lineups'
  | 'in_progress'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled';

export type SetStateStatus = 'pending' | 'agreed' | 'conflict';

export interface Club {
  id: UUID;
  name: string;
  shortName: string;
  isPublic: boolean;
}

export interface Season {
  id: UUID;
  name: string;
  startsOn: IsoDate | null;
  endsOn: IsoDate | null;
  isCurrent: boolean;
}

export interface Division {
  id: UUID;
  seasonId: UUID;
  name: string;
  sortOrder: number;
}

export interface Team {
  id: UUID;
  clubId: UUID;
  name: string;
  isPublic: boolean;
}

export interface Player {
  id: UUID;
  clubId: UUID;
  fullName: string;
  isPublic: boolean;
  isActive: boolean;
}

/** A player with display context (club, current team). */
export interface PlayerListItem {
  id: UUID;
  fullName: string;
  clubId: UUID;
  clubName: string;
  teamId: UUID | null;
  teamName: string | null;
}

export interface TeamRegistration {
  id: UUID;
  playerId: UUID;
  teamId: UUID;
  seasonId: UUID;
  divisionId: UUID;
  isActive: boolean;
}

export interface Round {
  id: UUID;
  divisionId: UUID;
  number: number;
  date: IsoDate;
  /** HH:MM or null when unknown */
  startTime: string | null;
  venue: string | null;
}

export interface Encounter {
  id: UUID;
  roundId: UUID;
  homeTeamId: UUID;
  awayTeamId: UUID;
  status: EncounterStatus;
  homeScore: number | null;
  awayScore: number | null;
  lineupsRevealedAt: string | null;
  doublesRevealedAt: string | null;
}

/** Encounter with team names and round – what most screens render. */
export interface EncounterDetail extends Encounter {
  homeTeamName: string;
  awayTeamName: string;
  round: Round;
}

export interface LeagueContext {
  season: Season;
  division: Division;
}

export interface RoundSession {
  id: UUID;
  roundId: UUID;
  encounterId: UUID;
  teamId: UUID;
  playerId: UUID;
  joinedAt: string;
  roundDate: IsoDate;
}

export interface RoundAccessCode {
  id: UUID;
  roundId: UUID;
  code: string;
  isActive: boolean;
  isDevSeed: boolean;
  createdAt: string;
  deactivatedAt: string | null;
}

export interface EncounterChoice {
  encounterId: UUID;
  teamId: UUID;
}

export type JoinRoundResult =
  | { status: 'joined'; roundId: UUID; encounterId: UUID; teamId: UUID }
  | { status: 'choose'; roundId: UUID; choices: EncounterChoice[] }
  | {
      status:
        | 'invalid_code'
        | 'no_profile'
        | 'not_registered'
        | 'no_encounter'
        | 'rate_limited'
        | 'not_authenticated';
    };

export type LineupSlotLetter = 'A' | 'B' | 'C' | 'X' | 'Y' | 'Z';

export interface LineupSlot {
  slot: LineupSlotLetter;
  playerId: UUID;
}

export interface Lineup {
  id: UUID;
  encounterId: UUID;
  teamId: UUID;
  side: TeamSide;
  submittedAt: string;
  slots: LineupSlot[];
}

export interface ReconciledSetState {
  encounterId: UUID;
  gameNumber: number;
  setNumber: number;
  status: SetStateStatus;
  homePoints: number | null;
  awayPoints: number | null;
}

/** Summary of one individual game (singles/doubles) inside an encounter. */
export interface EncounterGame {
  id: UUID;
  encounterId: UUID;
  gameNumber: number;
  kind: 'singles' | 'doubles';
  homePlayerIds: UUID[];
  awayPlayerIds: UUID[];
  homeSets: number;
  awaySets: number;
  winner: TeamSide | null;
}

export interface StandingRow {
  position: number;
  teamId: UUID;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gamesFor: number;
  gamesAgainst: number;
  points: number;
}

export interface PlayerRankingRow {
  position: number;
  playerId: UUID;
  won: number;
  lost: number;
}
