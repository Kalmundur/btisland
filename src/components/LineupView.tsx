import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { EncounterDetail, Lineup } from '../domain/types';
import { SLOT_LETTERS } from '../domain/lineup';

/**
 * Shows whatever lineups the caller is allowed to see (RLS filters hidden ones).
 * Revealed: both columns. Before reveal: only your own team's submitted lineup, if any.
 */
export function LineupView({
  encounter,
  lineups,
  names,
}: {
  encounter: EncounterDetail;
  lineups: Lineup[];
  names: Record<string, string>;
}) {
  const { t } = useTranslation();
  const bySide = { home: lineups.find((l) => l.side === 'home'), away: lineups.find((l) => l.side === 'away') };

  if (!bySide.home && !bySide.away) {
    return <p className="note">{t('live.lineupsHidden')}</p>;
  }

  const rows = [0, 1, 2].map((i) => {
    const hl = SLOT_LETTERS.home[i];
    const al = SLOT_LETTERS.away[i];
    const hp = bySide.home?.slots.find((s) => s.slot === hl)?.playerId;
    const ap = bySide.away?.slots.find((s) => s.slot === al)?.playerId;
    return { hl, al, hp, ap };
  });

  const name = (id?: string) =>
    id ? (
      <Link to={`/player/${id}`} className="lineup__name">
        {names[id] ?? '…'}
      </Link>
    ) : (
      <span className="lineup__name muted">{t('common.none')}</span>
    );

  return (
    <>
      <table className="lineup" aria-label={`${encounter.homeTeamName} – ${encounter.awayTeamName}`}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.hl}>
              <td className="lineup__letter">{r.hl}</td>
              <td className="lineup__cell">{name(r.hp)}</td>
              <td className="lineup__letter">{r.al}</td>
              <td className="lineup__cell">{name(r.ap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!encounter.lineupsRevealedAt && <p className="note">{t('live.lineupsHidden')}</p>}
    </>
  );
}
