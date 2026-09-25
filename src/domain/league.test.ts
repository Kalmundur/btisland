import { describe, expect, it } from 'vitest';
import { computeStandings } from './standings';
import { compareRatio } from './ratio';
import { playerSummary, rankSinglesPlayers, type GameWithContext } from './playerStats';
import { deriveRoundStatus, liveOverview } from './rounds';
import type { Encounter, EncounterGame, EncounterStatus, Round } from './types';

// --- fixtures -----------------------------------------------------------------------------
const teams = [
  { id: 'vik', name: 'Víkingur-A' },
  { id: 'kra', name: 'KR-A' },
  { id: 'bha', name: 'BH-A' },
  { id: 'hka', name: 'HK-A' },
];

let seq = 0;
const enc = (home: string, away: string, hs: number | null, as: number | null, status: EncounterStatus = 'completed'): Encounter => ({
  id: `e${++seq}`,
  roundId: 'r1',
  homeTeamId: home,
  awayTeamId: away,
  status,
  homeScore: hs,
  awayScore: as,
  lineupsRevealedAt: null,
  doublesRevealedAt: null,
  resultHash: null,
  resultVersion: 1,
});

/** Counted matches for an encounter: `results` = [homeGames, awayGames] per match. */
const gamesFor = (e: Encounter, results: Array<[number, number]>, kind: (i: number) => 'singles' | 'doubles' = () => 'singles'): EncounterGame[] =>
  results.map(([h, a], i) => ({
    id: `${e.id}-${i + 1}`,
    encounterId: e.id,
    matchNumber: i + 1,
    kind: kind(i),
    status: 'completed',
    homePlayerIds: [`${e.homeTeamId}-p${(i % 3) + 1}`],
    awayPlayerIds: [`${e.awayTeamId}-p${(i % 3) + 1}`],
    homeGames: h,
    awayGames: a,
    winner: h > a ? 'home' : 'away',
  }));

const row = (rows: ReturnType<typeof computeStandings>, id: string) => rows.find((r) => r.teamId === id)!;

// --- ratios ---------------------------------------------------------------------------------
describe('exact ratio comparison', () => {
  it('cross-multiplies instead of rounding', () => {
    expect(compareRatio({ won: 2, lost: 3 }, { won: 4, lost: 6 })).toBe(0);
    expect(compareRatio({ won: 1, lost: 3 }, { won: 333, lost: 1000 })).toBe(1); // 0.3333… > 0.333
    expect(compareRatio({ won: 7, lost: 5 }, { won: 3, lost: 2 })).toBe(-1);
  });
  it('treats a zero-loss record as an infinite ratio', () => {
    expect(compareRatio({ won: 1, lost: 0 }, { won: 99, lost: 1 })).toBe(1);
    expect(compareRatio({ won: 5, lost: 0 }, { won: 2, lost: 0 })).toBe(0);
    expect(compareRatio({ won: 0, lost: 0 }, { won: 0, lost: 4 })).toBe(0);
    expect(compareRatio({ won: 0, lost: 0 }, { won: 1, lost: 4 })).toBe(-1);
  });
});

// --- standings ----------------------------------------------------------------------------
describe('official standings', () => {
  it('awards 2 / 1 / 0 points', () => {
    const e1 = enc('vik', 'kra', 6, 3);
    const e2 = enc('bha', 'hka', 5, 5);
    const rows = computeStandings(teams, [e1, e2], []);
    expect([row(rows, 'vik').points, row(rows, 'kra').points, row(rows, 'bha').points, row(rows, 'hka').points]).toEqual([2, 0, 1, 1]);
    expect(row(rows, 'vik')).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, matchesWon: 6, matchesLost: 3 });
  });

  it('only officially confirmed encounters count', () => {
    const rows = computeStandings(teams, [
      enc('vik', 'kra', 6, 0, 'awaiting_confirmation'),
      enc('bha', 'hka', 4, 2, 'in_progress'),
      enc('kra', 'hka', 6, 4, 'completed'),
    ], []);
    expect(row(rows, 'vik')).toMatchObject({ played: 0, points: 0 });
    expect(row(rows, 'kra')).toMatchObject({ played: 1, points: 2 });
  });

  it('breaks equal points by the individual-match ratio', () => {
    // Víkingur 6–4, KR 6–1: both 2 pts; KR has the better match ratio.
    const rows = computeStandings(teams, [enc('vik', 'bha', 6, 4), enc('kra', 'hka', 6, 1)], []);
    expect(rows.map((r) => [r.teamId, r.position])).toEqual([['kra', 1], ['vik', 2], ['bha', 3], ['hka', 4]]);
  });

  it('then by the game ratio (only counted matches)', () => {
    const e1 = enc('vik', 'bha', 6, 3);
    const e2 = enc('kra', 'hka', 6, 3);
    const g1 = gamesFor(e1, [[3, 0], [3, 0], [3, 0], [3, 0], [3, 0], [3, 0], [0, 3], [0, 3], [0, 3]]); // 18–9
    const g2 = gamesFor(e2, [[3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [2, 3], [2, 3], [2, 3]]); // 24–21
    const rows = computeStandings(teams, [e1, e2], [...g1, ...g2]);
    expect(rows[0].teamId).toBe('vik');
    expect(rows[1].teamId).toBe('kra');
    expect(row(rows, 'vik')).toMatchObject({ gamesWon: 18, gamesLost: 9 });
  });

  it('exact ties share a rank; alphabetical order is display only', () => {
    const e1 = enc('vik', 'bha', 6, 2);
    const e2 = enc('kra', 'hka', 6, 2);
    const g = (e: Encounter) => gamesFor(e, [[3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [1, 3], [1, 3]]);
    const rows = computeStandings(teams, [e1, e2], [...g(e1), ...g(e2)]);
    expect(rows.slice(0, 2).map((r) => [r.teamName, r.position, r.tied])).toEqual([
      ['KR-A', 1, true],
      ['Víkingur-A', 1, true],
    ]);
    expect(rows.slice(2).map((r) => [r.position, r.tied])).toEqual([[3, true], [3, true]]);
  });

  it('never uses head-to-head or point differential', () => {
    // KR beat Víkingur head-to-head but Víkingur's ratios are better overall.
    const h2h = enc('kra', 'vik', 6, 5);
    const v2 = enc('vik', 'bha', 6, 0);
    const v3 = enc('vik', 'hka', 6, 0);
    const k2 = enc('kra', 'bha', 5, 6);
    const k3 = enc('kra', 'hka', 6, 4);
    const rows = computeStandings(teams, [h2h, v2, v3, k2, k3], []);
    expect(row(rows, 'vik').points).toBe(row(rows, 'kra').points);
    expect(rows[0].teamId).toBe('vik');
  });

  it('a correction to an old encounter changes the derived table', () => {
    const original = enc('vik', 'kra', 6, 4);
    const before = computeStandings(teams, [original], []);
    expect(before[0].teamId).toBe('vik');
    const corrected = { ...original, homeScore: 4, awayScore: 6, resultVersion: 2 };
    const after = computeStandings(teams, [corrected], []);
    expect(after[0].teamId).toBe('kra');
    expect(row(after, 'vik')).toMatchObject({ won: 0, lost: 1, points: 0 });
  });
});

// --- player ranking -------------------------------------------------------------------------
describe('Top 10 singles ranking', () => {
  const names: Record<string, string> = {};
  const nameOf = (id: string) => names[id] ?? id;
  const single = (encounterId: string, n: number, home: string, away: string, winner: 'home' | 'away', kind: 'singles' | 'doubles' = 'singles', status: EncounterGame['status'] = 'completed'): EncounterGame => ({
    id: `${encounterId}-${n}`, encounterId, matchNumber: n, kind, status,
    homePlayerIds: [home], awayPlayerIds: [away], homeGames: winner === 'home' ? 3 : 1, awayGames: winner === 'away' ? 3 : 1,
    winner: status === 'completed' ? winner : null,
  });

  it('sorts by most wins, then fewest losses, and shares equal ranks', () => {
    const games = [
      single('e1', 1, 'dadi', 'karl', 'home'),
      single('e1', 2, 'dadi', 'petur', 'home'),
      single('e1', 3, 'petur', 'karl', 'home'),
      single('e1', 4, 'petur', 'isak', 'away'),
      single('e1', 5, 'isak', 'karl', 'home'),
      single('e1', 6, 'isak', 'ellert', 'away'),
    ];
    const rows = rankSinglesPlayers(games, new Set(['e1']), nameOf, 10);
    // dadi 2–0 · ellert 1–0 · isak 2–1? (isak: beat petur, beat karl, lost to ellert = 2–1) · petur 1–2 · karl 0–3
    expect(rows.map((r) => [r.playerId, r.won, r.lost, r.position])).toEqual([
      ['dadi', 2, 0, 1],
      ['isak', 2, 1, 2],
      ['ellert', 1, 0, 3],
      ['petur', 1, 2, 4],
      ['karl', 0, 3, 5],
    ]);
  });

  it('never uses win percentage', () => {
    // 3–2 (60%) ranks above 1–0 (100%): more wins first.
    const games = [
      ...[1, 2, 3].map((n) => single('e1', n, 'a', `x${n}`, 'home')),
      single('e1', 4, 'a', 'y', 'away'),
      single('e1', 5, 'a', 'z', 'away'),
      single('e1', 6, 'b', 'w', 'home'),
    ];
    const rows = rankSinglesPlayers(games, new Set(['e1']), nameOf, 10);
    expect(rows[0]).toMatchObject({ playerId: 'a', won: 3, lost: 2, position: 1 });
  });

  it('equal records share a rank', () => {
    const rows = rankSinglesPlayers([single('e1', 1, 'a', 'b', 'home'), single('e1', 2, 'c', 'd', 'home')], new Set(['e1']), nameOf, 10);
    expect(rows.filter((r) => r.won === 1).map((r) => [r.position, r.tied])).toEqual([[1, true], [1, true]]);
    expect(rows.filter((r) => r.won === 0).every((r) => r.position === 3)).toBe(true);
  });

  it('doubles have zero effect', () => {
    const rows = rankSinglesPlayers(
      [single('e1', 1, 'a', 'b', 'home'), single('e1', 7, 'b', 'a', 'home', 'doubles'), single('e1', 8, 'b', 'c', 'home', 'doubles')],
      new Set(['e1']),
      nameOf,
      10,
    );
    expect(rows.find((r) => r.playerId === 'a')).toMatchObject({ won: 1, lost: 0 });
    expect(rows.find((r) => r.playerId === 'b')).toMatchObject({ won: 0, lost: 1 });
    expect(rows.find((r) => r.playerId === 'c')).toBeUndefined();
  });

  it('only officially confirmed encounters and counted matches count', () => {
    const rows = rankSinglesPlayers(
      [single('e1', 1, 'a', 'b', 'home'), single('e2', 1, 'a', 'b', 'home'), single('e1', 9, 'a', 'b', 'home', 'singles', 'not_played')],
      new Set(['e1']),
      nameOf,
      10,
    );
    expect(rows.find((r) => r.playerId === 'a')).toMatchObject({ won: 1, lost: 0 });
  });

  it('keeps everyone tied on the 10th place', () => {
    const games = Array.from({ length: 12 }, (_, i) => single('e1', i + 1, `p${i}`, `q${i}`, 'home'));
    const rows = rankSinglesPlayers(games, new Set(['e1']), nameOf, 10);
    expect(rows).toHaveLength(12); // all 12 winners share rank 1
  });
});

describe('player summary', () => {
  const ctx = (g: Partial<GameWithContext> & Pick<GameWithContext, 'matchNumber' | 'kind' | 'homePlayerIds' | 'awayPlayerIds' | 'winner'>): GameWithContext => ({
    id: `g${g.matchNumber}${g.roundNumber ?? 1}`, encounterId: 'e', status: 'completed', homeGames: g.winner === 'home' ? 3 : 1, awayGames: g.winner === 'away' ? 3 : 1,
    encounterStatus: 'completed', roundDate: '2026-10-17', roundNumber: 1, homeTeamName: 'Víkingur-A', awayTeamName: 'KR-B', ...g,
  });

  it('separates singles and doubles and counts games from the player’s side', () => {
    const s = playerSummary('dadi', [
      ctx({ matchNumber: 3, kind: 'singles', homePlayerIds: ['dadi'], awayPlayerIds: ['karl'], winner: 'home' }),
      ctx({ matchNumber: 6, kind: 'singles', homePlayerIds: ['dadi'], awayPlayerIds: ['ellert'], winner: 'away' }),
      ctx({ matchNumber: 7, kind: 'doubles', homePlayerIds: ['dadi', 'isak'], awayPlayerIds: ['karl', 'lukas'], winner: 'home' }),
      ctx({ matchNumber: 2, kind: 'singles', homePlayerIds: ['dadi'], awayPlayerIds: ['x'], winner: 'home', encounterStatus: 'awaiting_confirmation' }),
    ]);
    expect(s.singles).toEqual({ won: 1, lost: 1, played: 2, gamesWon: 4, gamesLost: 4, winPct: 50 });
    expect(s.doubles).toEqual({ won: 1, lost: 0, played: 1 });
    expect(s.recentSingles[0]).toMatchObject({ matchNumber: 6, won: false, gamesFor: 1, gamesAgainst: 3, opponentIds: ['ellert'] });
    expect(s.recentDoubles[0].partnerIds).toEqual(['isak']);
  });
});

// --- rounds -----------------------------------------------------------------------------------
describe('derived round status', () => {
  const e = (status: EncounterStatus) => ({ status });
  it('Ekki hafin / Í gangi / Lokið', () => {
    expect(deriveRoundStatus([e('scheduled'), e('scheduled')])).toBe('not_started');
    expect(deriveRoundStatus([e('scheduled'), e('in_progress')])).toBe('in_progress');
    expect(deriveRoundStatus([e('completed'), e('awaiting_confirmation')])).toBe('in_progress');
    expect(deriveRoundStatus([e('completed'), e('cancelled')])).toBe('finished');
  });

  it('builds the live overview', () => {
    const round = (id: string, number: number, date: string): Round => ({ id, divisionId: 'd', number, date, startTime: null, venue: null });
    const rounds = [round('r1', 1, '2026-09-19'), round('r2', 2, '2026-10-17'), round('r3', 3, '2026-11-22')];
    const encs = [
      { roundId: 'r1', status: 'completed' as const },
      { roundId: 'r2', status: 'in_progress' as const },
      { roundId: 'r3', status: 'scheduled' as const },
    ];
    const o = liveOverview(rounds, encs, '2026-10-17');
    expect(o.active).toHaveLength(1);
    expect(o.upcoming?.id).toBe('r3');
    expect(o.recent.map((r) => r.id)).toEqual(['r1']);
  });
});
