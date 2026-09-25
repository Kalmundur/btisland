import { STANDINGS_POINTS } from '../config/app';
import type { Encounter, StandingRow, UUID } from './types';

export interface StandingsTeam {
  id: UUID;
  name: string;
}

export interface PointsRule {
  win: number;
  draw: number;
  loss: number;
}

type Tally = Omit<StandingRow, 'position'>;

/**
 * League table from official (completed) encounters.
 * Sort: points, game difference, games won, then name (Icelandic collation).
 * Teams fully level on points and games share a position.
 */
export function computeStandings(
  teams: readonly StandingsTeam[],
  encounters: readonly Encounter[],
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
      gamesFor: 0,
      gamesAgainst: 0,
      points: 0,
    });
  }

  for (const e of encounters) {
    if (e.status !== 'completed' || e.homeScore == null || e.awayScore == null) continue;
    const home = rows.get(e.homeTeamId);
    const away = rows.get(e.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gamesFor += e.homeScore;
    home.gamesAgainst += e.awayScore;
    away.gamesFor += e.awayScore;
    away.gamesAgainst += e.homeScore;

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

  const collator = new Intl.Collator('is');
  const diff = (r: Tally) => r.gamesFor - r.gamesAgainst;
  const sorted = [...rows.values()]
    .map((r) => ({ ...r, points: r.won * rule.win + r.drawn * rule.draw + r.lost * rule.loss }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        diff(b) - diff(a) ||
        b.gamesFor - a.gamesFor ||
        collator.compare(a.teamName, b.teamName),
    );

  const result: StandingRow[] = [];
  sorted.forEach((row, i) => {
    const prev = result[i - 1];
    const level =
      prev &&
      prev.points === row.points &&
      prev.gamesFor === row.gamesFor &&
      prev.gamesAgainst === row.gamesAgainst;
    result.push({ ...row, position: level ? prev.position : i + 1 });
  });
  return result;
}
