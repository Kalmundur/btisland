import type { IsoDate, RoundSession } from './types';

/** A joined round stays active through the day after the round date (late finishes, confirmations). */
export const ACTIVE_SESSION_GRACE_DAYS = 1;

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date in Iceland (UTC+0 all year) as YYYY-MM-DD. */
export function todayInIceland(now: Date = new Date()): IsoDate {
  return now.toISOString().slice(0, 10);
}

/** Most recently joined session whose round has not expired. */
export function pickActiveSession(sessions: readonly RoundSession[], today: IsoDate): RoundSession | null {
  const candidates = sessions.filter((s) => addDays(s.roundDate, ACTIVE_SESSION_GRACE_DAYS) >= today);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))[0];
}
