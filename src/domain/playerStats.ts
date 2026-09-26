/**
 * Player statistics, derived from officially confirmed encounters only.
 *
 * Top 10: SINGLES only (doubles have zero effect). Order:
 *   1. most singles wins  2. fewest singles losses  3. best set differential
 *   4. best point differential.
 * Players level on all four are genuinely tied and share a position range (e.g. 2–4);
 * name order inside a tie only makes rendering stable – it is not a tiebreaker.
 */
import type { EncounterGame, GameScore, IsoDate, PlayerRankingRow, TeamSide, UUID } from './types';

/** A counted match of an officially confirmed encounter. */
const counts = (g: EncounterGame, official: ReadonlySet<UUID>) =>
  official.has(g.encounterId) && g.status === 'completed' && g.winner !== null;

type Stats = Omit<PlayerRankingRow, 'position' | 'positionEnd' | 'tied'>;

/** Negative when `a` ranks above `b`; 0 = genuinely tied. */
export function compareSinglesRecords(a: Stats, b: Stats): number {
  return (
    b.won - a.won ||
    a.lost - b.lost ||
    b.setsWon - b.setsLost - (a.setsWon - a.setsLost) ||
    b.pointsWon - b.pointsLost - (a.pointsWon - a.pointsLost)
  );
}

export function rankSinglesPlayers(
  games: readonly EncounterGame[],
  officialEncounterIds: ReadonlySet<UUID>,
  nameOf: (playerId: UUID) => string,
  limit: number,
  gameScores: readonly GameScore[] = [],
): PlayerRankingRow[] {
  const scoresByMatch = new Map<string, GameScore[]>();
  for (const s of gameScores) {
    const key = `${s.encounterId}:${s.matchNumber}`;
    scoresByMatch.set(key, [...(scoresByMatch.get(key) ?? []), s]);
  }

  const stats = new Map<UUID, Stats>();
  const add = (id: UUID, won: boolean, setsFor: number, setsAgainst: number, pointsFor: number, pointsAgainst: number) => {
    const s = stats.get(id) ?? { playerId: id, won: 0, lost: 0, setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0 };
    if (won) s.won++;
    else s.lost++;
    s.setsWon += setsFor;
    s.setsLost += setsAgainst;
    s.pointsWon += pointsFor;
    s.pointsLost += pointsAgainst;
    stats.set(id, s);
  };
  for (const g of games) {
    if (g.kind !== 'singles' || !counts(g, officialEncounterIds)) continue;
    // Only games up to the deciding one count (as in the database's derivation).
    const played = g.homeGames + g.awayGames;
    const scores = (scoresByMatch.get(`${g.encounterId}:${g.matchNumber}`) ?? []).filter((s) => s.gameNumber <= played);
    const homePts = scores.reduce((n, s) => n + s.homePoints, 0);
    const awayPts = scores.reduce((n, s) => n + s.awayPoints, 0);
    for (const id of g.homePlayerIds) add(id, g.winner === 'home', g.homeGames, g.awayGames, homePts, awayPts);
    for (const id of g.awayPlayerIds) add(id, g.winner === 'away', g.awayGames, g.homeGames, awayPts, homePts);
  }

  const collator = new Intl.Collator('is');
  const sorted = [...stats.values()].sort(
    (a, b) => compareSinglesRecords(a, b) || collator.compare(nameOf(a.playerId), nameOf(b.playerId)),
  );

  // Tie groups: consecutive rows that are level on all four criteria share the range
  // of row positions they occupy; the next row continues with its own position.
  const ranked: PlayerRankingRow[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && compareSinglesRecords(sorted[i], sorted[j]) === 0) j++;
    for (let k = i; k < j; k++) ranked.push({ ...sorted[k], position: i + 1, positionEnd: j, tied: j - i > 1 });
    i = j;
  }
  // Everyone ranked within the limit (a tie on the boundary is shown in full).
  return ranked.filter((r) => r.position <= limit);
}

/** "3", or "2–4" (en dash) for a genuinely tied group. */
export function formatRankPosition(row: Pick<PlayerRankingRow, 'position' | 'positionEnd'>): string {
  return row.positionEnd > row.position ? `${row.position}–${row.positionEnd}` : String(row.position);
}

/** A match with the context needed for a player page. */
export interface GameWithContext extends EncounterGame {
  encounterStatus: string;
  roundDate: IsoDate;
  roundNumber: number;
  homeTeamName: string;
  awayTeamName: string;
}

export interface PlayerMatchLine {
  encounterId: UUID;
  matchNumber: number;
  roundNumber: number;
  date: IsoDate;
  side: TeamSide;
  won: boolean;
  gamesFor: number;
  gamesAgainst: number;
  opponentIds: UUID[];
  partnerIds: UUID[];
  opponentTeam: string;
}

export interface PlayerSummary {
  singles: { won: number; lost: number; played: number; gamesWon: number; gamesLost: number; winPct: number | null };
  doubles: { won: number; lost: number; played: number };
  recentSingles: PlayerMatchLine[];
  recentDoubles: PlayerMatchLine[];
}

export function playerSummary(playerId: UUID, games: readonly GameWithContext[], recentLimit = 10): PlayerSummary {
  const lines: Array<PlayerMatchLine & { kind: 'singles' | 'doubles' }> = [];
  for (const g of games) {
    if (g.encounterStatus !== 'completed' || g.status !== 'completed' || !g.winner) continue;
    const side: TeamSide | null = g.homePlayerIds.includes(playerId) ? 'home' : g.awayPlayerIds.includes(playerId) ? 'away' : null;
    if (!side) continue;
    const mine = side === 'home' ? g.homePlayerIds : g.awayPlayerIds;
    lines.push({
      kind: g.kind,
      encounterId: g.encounterId,
      matchNumber: g.matchNumber,
      roundNumber: g.roundNumber,
      date: g.roundDate,
      side,
      won: g.winner === side,
      gamesFor: side === 'home' ? g.homeGames : g.awayGames,
      gamesAgainst: side === 'home' ? g.awayGames : g.homeGames,
      opponentIds: side === 'home' ? g.awayPlayerIds : g.homePlayerIds,
      partnerIds: mine.filter((id) => id !== playerId),
      opponentTeam: side === 'home' ? g.awayTeamName : g.homeTeamName,
    });
  }
  const newestFirst = (a: PlayerMatchLine, b: PlayerMatchLine) =>
    b.date.localeCompare(a.date) || b.roundNumber - a.roundNumber || b.matchNumber - a.matchNumber;
  const singles = lines.filter((l) => l.kind === 'singles');
  const doubles = lines.filter((l) => l.kind === 'doubles');
  const sWon = singles.filter((l) => l.won).length;
  return {
    singles: {
      won: sWon,
      lost: singles.length - sWon,
      played: singles.length,
      gamesWon: singles.reduce((n, l) => n + l.gamesFor, 0),
      gamesLost: singles.reduce((n, l) => n + l.gamesAgainst, 0),
      winPct: singles.length ? Math.round((sWon / singles.length) * 100) : null,
    },
    doubles: { won: doubles.filter((l) => l.won).length, lost: doubles.filter((l) => !l.won).length, played: doubles.length },
    recentSingles: [...singles].sort(newestFirst).slice(0, recentLimit),
    recentDoubles: [...doubles].sort(newestFirst).slice(0, recentLimit),
  };
}
