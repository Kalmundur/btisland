/**
 * Game reconciliation rule (the database trigger public.reconcile_game is the authority;
 * this mirror documents and tests the rule):
 *   no submissions        -> no canonical score
 *   all submissions equal -> that score
 *   any difference        -> conflict (no majority voting, ever)
 */
export interface ScoreSubmission {
  homePoints: number;
  awayPoints: number;
}

export type Reconciliation =
  | { status: 'none'; submitterCount: 0 }
  | { status: 'agreed'; homePoints: number; awayPoints: number; submitterCount: number }
  | { status: 'conflict'; values: ScoreSubmission[]; submitterCount: number };

export function reconcileGame(submissions: readonly ScoreSubmission[]): Reconciliation {
  if (submissions.length === 0) return { status: 'none', submitterCount: 0 };
  const distinct = new Map<string, ScoreSubmission>();
  for (const s of submissions) distinct.set(`${s.homePoints}-${s.awayPoints}`, s);
  if (distinct.size === 1) {
    const [only] = distinct.values();
    return { status: 'agreed', homePoints: only.homePoints, awayPoints: only.awayPoints, submitterCount: submissions.length };
  }
  return { status: 'conflict', values: [...distinct.values()], submitterCount: submissions.length };
}
