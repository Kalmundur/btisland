/**
 * Player statistics, derived from officially confirmed encounters only.
 *
 * Top 10: SINGLES only (doubles have zero effect). Order: most singles wins, then fewer
 * singles losses. Equal records share a rank; name order only makes rendering stable.
 */
import type { EncounterGame, IsoDate, PlayerRankingRow, TeamSide, UUID } from './types';

/** A counted match of an officially confirmed encounter. */
const counts = (g: EncounterGame, official: ReadonlySet<UUID>) =>
  official.has(g.encounterId) && g.status === 'completed' && g.winner !== null;

export function rankSinglesPlayers(
  games: readonly EncounterGame[],
  officialEncounterIds: ReadonlySet<UUID>,
  nameOf: (playerId: UUID) => string,
  limit: number,
): PlayerRankingRow[] {
  const stats = new Map<UUID, { won: number; lost: number }>();
  const bump = (id: UUID, won: boolean) => {
    const s = stats.get(id) ?? { won: 0, lost: 0 };
    if (won) s.won++;
    else s.lost++;
    stats.set(id, s);
  };
  for (const g of games) {
    if (g.kind !== 'singles' || !counts(g, officialEncounterIds)) continue;
    for (const id of g.homePlayerIds) bump(id, g.winner === 'home');
    for (const id of g.awayPlayerIds) bump(id, g.winner === 'away');
  }

  const collator = new Intl.Collator('is');
  const sorted = [...stats.entries()]
    .map(([playerId, s]) => ({ playerId, ...s }))
    .sort((a, b) => b.won - a.won || a.lost - b.lost || collator.compare(nameOf(a.playerId), nameOf(b.playerId)));

  const ranked: PlayerRankingRow[] = [];
  sorted.forEach((row, i) => {
    const prev = ranked[i - 1];
    const level = prev !== undefined && prev.won === row.won && prev.lost === row.lost;
    ranked.push({ ...row, position: level ? prev.position : i + 1, tied: false });
  });
  for (const r of ranked) r.tied = ranked.filter((o) => o.position === r.position).length > 1;
  // Everyone ranked within the limit (a tie on the boundary is shown in full).
  return ranked.filter((r) => r.position <= limit);
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
