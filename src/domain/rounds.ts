/** Derived round/live-overview state – nothing here is stored or maintained by organizers. */
import type { Encounter, EncounterStatus, IsoDate, Round } from './types';

export type RoundStatus = 'not_started' | 'in_progress' | 'finished';

const FINAL: readonly EncounterStatus[] = ['completed', 'cancelled'];
const NOT_STARTED: readonly EncounterStatus[] = ['scheduled', 'postponed', 'cancelled'];

/**
 * Ekki hafin: nothing has started. Lokið: every encounter is confirmed (or cancelled).
 * Í gangi: anything in between.
 */
export function deriveRoundStatus(encounters: readonly Pick<Encounter, 'status'>[]): RoundStatus {
  if (encounters.length === 0) return 'not_started';
  if (encounters.every((e) => FINAL.includes(e.status)) && encounters.some((e) => e.status === 'completed')) return 'finished';
  if (encounters.every((e) => NOT_STARTED.includes(e.status))) return 'not_started';
  return 'in_progress';
}

export interface LiveOverview {
  /** Rounds in progress right now, in playing order (two rounds can share a day). */
  ongoing: Round[];
  /** Next round that has not started and is today or later. */
  upcoming: Round | null;
  /** Finished rounds, newest first. */
  recent: Round[];
}

export function liveOverview<E extends Pick<Encounter, 'status' | 'roundId'>>(
  rounds: readonly Round[],
  encounters: readonly E[],
  today: IsoDate,
  recentLimit = 2,
): LiveOverview {
  const byRound = (r: Round) => encounters.filter((e) => e.roundId === r.id);
  const status = new Map(rounds.map((r) => [r.id, deriveRoundStatus(byRound(r))]));
  const chronological = [...rounds].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  return {
    ongoing: chronological.filter((r) => status.get(r.id) === 'in_progress'),
    upcoming: chronological.find((r) => r.date >= today && status.get(r.id) === 'not_started') ?? null,
    recent: chronological.filter((r) => status.get(r.id) === 'finished').reverse().slice(0, recentLimit),
  };
}

/**
 * The round the live timeline opens at (the list itself stays in numeric order):
 * 1) the first round in progress, 2) otherwise the earliest round that hasn't started,
 * preferring ones dated today or later, 3) otherwise the latest finished round.
 */
export function focusRound<E extends Pick<Encounter, 'status' | 'roundId'>>(
  rounds: readonly Round[],
  encounters: readonly E[],
  today: IsoDate,
): Round | null {
  const ordered = [...rounds].sort((a, b) => a.number - b.number);
  const status = (r: Round) => deriveRoundStatus(encounters.filter((e) => e.roundId === r.id));
  return (
    ordered.find((r) => status(r) === 'in_progress') ??
    ordered.find((r) => status(r) === 'not_started' && r.date >= today) ??
    ordered.find((r) => status(r) === 'not_started') ??
    [...ordered].reverse().find((r) => status(r) === 'finished') ??
    ordered[ordered.length - 1] ??
    null
  );
}
