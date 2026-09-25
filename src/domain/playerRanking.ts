import type { EncounterGame, PlayerRankingRow, UUID } from './types';

/**
 * Ranks players by decided singles games: wins, then win ratio, then fewer losses.
 * Players without decided games are not ranked.
 */
export function rankPlayers(games: readonly EncounterGame[], limit: number): PlayerRankingRow[] {
  const stats = new Map<UUID, { won: number; lost: number }>();
  const bump = (id: UUID, won: boolean) => {
    const s = stats.get(id) ?? { won: 0, lost: 0 };
    if (won) s.won++;
    else s.lost++;
    stats.set(id, s);
  };

  for (const g of games) {
    if (g.kind !== 'singles' || !g.winner) continue;
    for (const id of g.homePlayerIds) bump(id, g.winner === 'home');
    for (const id of g.awayPlayerIds) bump(id, g.winner === 'away');
  }

  const ratio = (s: { won: number; lost: number }) => s.won / (s.won + s.lost);
  return [...stats.entries()]
    .map(([playerId, s]) => ({ playerId, ...s }))
    .sort(
      (a, b) =>
        b.won - a.won || ratio(b) - ratio(a) || a.lost - b.lost || a.playerId.localeCompare(b.playerId),
    )
    .slice(0, limit)
    .map((row, i) => ({ position: i + 1, ...row }));
}
