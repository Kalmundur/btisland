import { describe, expect, it } from 'vitest';
import { SEED_CLUBS, SEED_ROUNDS, SEED_TEAMS } from './leagueSeed';

const teamNames = SEED_TEAMS.map((t) => t.name);

describe('seed data relationships', () => {
  it('every team belongs to a seeded club', () => {
    for (const team of SEED_TEAMS) expect(SEED_CLUBS).toContain(team.club);
  });

  it('team names and player names are unique', () => {
    expect(new Set(teamNames).size).toBe(teamNames.length);
    const players = SEED_TEAMS.flatMap((t) => t.players);
    expect(new Set(players).size).toBe(players.length);
    expect(players).toHaveLength(37);
  });

  it('every encounter references seeded teams and never pits a team against itself', () => {
    for (const round of SEED_ROUNDS) {
      for (const [home, away] of round.encounters) {
        expect(teamNames).toContain(home);
        expect(teamNames).toContain(away);
        expect(home).not.toBe(away);
      }
    }
  });

  it('each team plays exactly once per round', () => {
    for (const round of SEED_ROUNDS) {
      const playing = round.encounters.flat();
      expect(new Set(playing).size).toBe(teamNames.length);
    }
  });

  it('every pair meets twice, once at home each (double round robin)', () => {
    const meetings = new Map<string, number>();
    for (const round of SEED_ROUNDS) {
      for (const [home, away] of round.encounters) {
        const key = `${home}>${away}`;
        meetings.set(key, (meetings.get(key) ?? 0) + 1);
      }
    }
    for (const a of teamNames) {
      for (const b of teamNames) {
        if (a === b) continue;
        expect(meetings.get(`${a}>${b}`), `${a} hosts ${b}`).toBe(1);
      }
    }
  });

  it('rounds are numbered 1..10 with unique six-digit dev codes', () => {
    expect(SEED_ROUNDS.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const codes = SEED_ROUNDS.map((r) => r.devAccessCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[0-9]{6}$/);
  });
});
