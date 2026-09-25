/**
 * Exact won/lost ratio comparison – no floating point.
 *   x/0 with x > 0  -> infinite (better than any finite ratio; equal to other infinite ratios)
 *   0/0             -> 0 (same as 0/n)
 * Returns > 0 when `a` is the better ratio, < 0 when `b` is, 0 when exactly equal.
 */
export interface WonLost {
  won: number;
  lost: number;
}

export function compareRatio(a: WonLost, b: WonLost): number {
  const aInf = a.lost === 0 && a.won > 0;
  const bInf = b.lost === 0 && b.won > 0;
  if (aInf || bInf) return Number(aInf) - Number(bInf);
  // Finite: treat 0/0 as 0/1. Cross-multiply: a.won/a.lost ? b.won/b.lost
  const aLost = a.lost === 0 ? 1 : a.lost;
  const bLost = b.lost === 0 ? 1 : b.lost;
  return Math.sign(a.won * bLost - b.won * aLost);
}
