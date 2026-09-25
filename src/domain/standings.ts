/**
 * Official league table, derived – never stored.
 *
 * Only OFFICIALLY CONFIRMED encounters (status 'completed') count.
 * Points: win 2, draw 1 each, loss 0.
 * Order: 1) points  2) individual matches won/lost ratio  3) games won/lost ratio.
 * Anything still equal is a genuine tie: same position, `tied: true`. Alphabetical order
 * is only used to render tied teams deterministically – it is not a tiebreaker.
 */
import { STANDINGS_POINTS } from '../config/app';
import { compareRatio } from './ratio';
import type { Encounter, EncounterGame, StandingRow, UUID } from './types';

export interface StandingsTeam {
  id: UUID;
  name: string;
}

export interface PointsRule {
  win: number;
  draw: number;
  loss: number;
}

type Tally = Omit<StandingRow, 'position' | 'tied'>;

export const isOfficial = (e: Pick<Encounter, 'status'>) => e.status === 'completed';

/** Official comparison: > 0 when `a` ranks above `b`, 0 when they are officially level. */
export function compareStandings(a: Tally, b: Tally): number {
  return (
    Math.sign(a.points - b.points) ||
    compareRatio({ won: a.matchesWon, lost: a.matchesLost }, { won: b.matchesWon, lost: b.matchesLost }) ||
    compareRatio({ won: a.gamesWon, lost: a.gamesLost }, { won: b.gamesWon, lost: b.gamesLost })
  );
}

export function computeStandings(
  teams: readonly StandingsTeam[],
  encounters: readonly Encounter[],
  games: readonly EncounterGame[],
  rule: PointsRule = STANDINGS_POINTS,
): StandingRow[] {
  const rows = new Map<UUID, Tally>();
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      matchesWon: 0,
      matchesLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      points: 0,
    });
  }

  const official = new Map(encounters.filter(isOfficial).map((e) => [e.id, e]));

  for (const e of official.values()) {
    const home = rows.get(e.homeTeamId);
    const away = rows.get(e.awayTeamId);
    if (!home || !away || e.homeScore == null || e.awayScore == null) continue;
    home.played++;
    away.played++;
    home.matchesWon += e.homeScore;
    home.matchesLost += e.awayScore;
    away.matchesWon += e.awayScore;
    away.matchesLost += e.homeScore;
    if (e.homeScore > e.awayScore) {
      home.won++;
      away.lost++;
    } else if (e.homeScore < e.awayScore) {
      away.won++;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
    }
  }

  // Games ("lotur") only from counted matches of official encounters; unplayed matches add nothing.
  for (const g of games) {
    const e = official.get(g.encounterId);
    if (!e || g.status !== 'completed') continue;
    const home = rows.get(e.homeTeamId);
    const away = rows.get(e.awayTeamId);
    if (!home || !away) continue;
    home.gamesWon += g.homeGames;
    home.gamesLost += g.awayGames;
    away.gamesWon += g.awayGames;
    away.gamesLost += g.homeGames;
  }

  for (const r of rows.values()) r.points = r.won * rule.win + r.drawn * rule.draw + r.lost * rule.loss;

  const collator = new Intl.Collator('is');
  const sorted = [...rows.values()].sort(
    (a, b) => compareStandings(b, a) || collator.compare(a.teamName, b.teamName), // name: display only
  );

  const result: StandingRow[] = [];
  sorted.forEach((row, i) => {
    const prev = result[i - 1];
    const level = prev !== undefined && compareStandings(prev, row) === 0;
    result.push({ ...row, position: level ? prev.position : i + 1, tied: false });
  });
  // Mark every member of a tie group.
  for (let i = 0; i < result.length; i++) {
    const samePos = result.filter((r) => r.position === result[i].position).length > 1;
    result[i].tied = samePos;
  }
  return result;
}
