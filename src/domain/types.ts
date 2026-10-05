/** Domain types. Independent of Supabase row shapes (see src/data/mappers.ts). */

export type UUID = string;
/** ISO date, YYYY-MM-DD */
export type IsoDate = string;

export type TeamSide = 'home' | 'away';

export type EncounterStatus =
  | 'scheduled'
  | 'postponed'
  | 'lineups'
  | 'in_progress'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled';

export type SetStateStatus = 'pending' | 'agreed' | 'conflict';

export interface Club {
  id: UUID;
  name: string;
  shortName: string | null;
  isPublic: boolean;
  isActive: boolean;
  logoUrl: string | null;
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
  formatKey: string;
}

export interface Team {
  id: UUID;
  clubId: UUID;
  name: string;
  isPublic: boolean;
  isActive: boolean;
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
  /** Fingerprint of the current reconciled result; confirmations are bound to it. */
  resultHash: string | null;
  resultVersion: number;
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

export interface SelectionConfirmation {
  playerId: UUID;
  version: number;
}

/** Common shape of a team's lineup and doubles selection (versioned, two-person confirmed). */
export interface TeamSelection {
  id: UUID;
  encounterId: UUID;
  teamId: UUID;
  side: TeamSide;
  version: number;
  /** Distinct players who confirmed the current version (maintained by the server). */
  confirmedCount: number;
  lockedAt: string | null;
  /** Visible to your own team before reveal; to everybody afterwards (RLS). */
  confirmations: SelectionConfirmation[];
}

export interface Lineup extends TeamSelection {
  submittedAt: string;
  /** Empty for the opponent until both lineups are locked. */
  slots: LineupSlot[];
}

export interface DoublesSelection extends TeamSelection {
  /** Ordered pair; empty for the opponent until both pairs are locked. */
  playerIds: UUID[];
}

/** Canonical state of one game ("lota"), maintained by the database. */
export interface ReconciledGame {
  encounterId: UUID;
  matchNumber: number;
  gameNumber: number;
  /** agreed: all submissions identical. conflict: they differ (points hidden). */
  status: SetStateStatus;
  homePoints: number | null;
  awayPoints: number | null;
  submitterCount: number;
}

/** One scorer's own entry for one game. */
export interface SetEntry {
  id: UUID;
  encounterId: UUID;
  matchNumber: number;
  gameNumber: number;
  side: TeamSide;
  homePoints: number;
  awayPoints: number;
  submittedByPlayerId: UUID;
  clientEntryId: UUID;
  updatedAt: string;
}

/**
 * One player's resolution of a conflicted game (table game_conflict_confirmations). One player of
 * either team is enough; the newest active row is current. `supersededAt` is set when a newer
 * resolution replaced it (kept as history). Only visible to participants and organizers.
 */
export interface ConflictConfirmation {
  id: UUID;
  encounterId: UUID;
  matchNumber: number;
  gameNumber: number;
  side: TeamSide;
  playerId: UUID;
  homePoints: number;
  awayPoints: number;
  createdAt: string;
  supersededAt: string | null;
}

export type MatchStatus = 'locked' | 'available' | 'in_progress' | 'conflict' | 'completed' | 'not_played';

/** Server-derived summary of one individual match (singles/doubles) inside an encounter. */
export interface EncounterGame {
  id: UUID;
  encounterId: UUID;
  matchNumber: number;
  kind: 'singles' | 'doubles';
  status: MatchStatus;
  homePlayerIds: UUID[];
  awayPlayerIds: UUID[];
  homeGames: number;
  awayGames: number;
  /** Only set for counted matches. */
  winner: TeamSide | null;
}

export interface ResultConfirmation {
  id: UUID;
  encounterId: UUID;
  side: TeamSide;
  playerId: UUID;
  resultHash: string | null;
  resultVersion: number | null;
  createdAt: string;
  invalidatedAt: string | null;
}

export interface StandingRow {
  /** Shared by officially tied teams. */
  position: number;
  tied: boolean;
  teamId: UUID;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Individual matches won/lost (tiebreaker 1). */
  matchesWon: number;
  matchesLost: number;
  /** Games (lotur) won/lost (tiebreaker 2). */
  gamesWon: number;
  gamesLost: number;
  points: number;
}

export interface PlayerRankingRow {
  /** First position occupied by this row's tie group (= the rank when not tied). */
  position: number;
  /** Last position occupied by the tie group (equal to `position` when not tied). */
  positionEnd: number;
  tied: boolean;
  playerId: UUID;
  /** Singles only. */
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

/** Agreed points of one game ("lota") – used for singles point differential. */
export interface GameScore {
  encounterId: UUID;
  matchNumber: number;
  gameNumber: number;
  homePoints: number;
  awayPoints: number;
}
