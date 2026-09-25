/** Derived round/live-overview state – nothing here is stored or maintained by organizers. */
import type { Encounter, EncounterStatus, IsoDate, Round } from './types';

export type RoundStatus = 'not_started' | 'in_progress' | 'finished';

const FINAL: readonly EncounterStatus[] = ['completed', 'cancelled'];
const NOT_STARTED: readonly EncounterStatus[] = ['scheduled', 'postponed', 'cancelled'];
export const ACTIVE_STATUSES: readonly EncounterStatus[] = ['lineups', 'in_progress', 'awaiting_confirmation'];

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

export interface LiveOverview<E extends Pick<Encounter, 'status' | 'roundId'>> {
  active: E[];
  /** Next round that has not finished and is today or later. */
  upcoming: Round | null;
  /** Finished rounds, newest first. */
  recent: Round[];
}

export function liveOverview<E extends Pick<Encounter, 'status' | 'roundId'>>(
  rounds: readonly Round[],
  encounters: readonly E[],
  today: IsoDate,
  recentLimit = 2,
): LiveOverview<E> {
  const byRound = (r: Round) => encounters.filter((e) => e.roundId === r.id);
  const status = new Map(rounds.map((r) => [r.id, deriveRoundStatus(byRound(r))]));
  const chronological = [...rounds].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  return {
    active: encounters.filter((e) => ACTIVE_STATUSES.includes(e.status)),
    upcoming: chronological.find((r) => r.date >= today && status.get(r.id) === 'not_started') ?? null,
    recent: chronological.filter((r) => status.get(r.id) === 'finished').reverse().slice(0, recentLimit),
  };
}
