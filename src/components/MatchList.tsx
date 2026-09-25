import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Lock } from 'lucide-react';
import type { EncounterState, MatchState } from '../domain/encounterState';
import { matchParticipants, type EncounterData } from '../hooks/useEncounterData';

const TAPPABLE = new Set(['available', 'in_progress', 'conflict', 'completed']);

/**
 * Compact list of the ten individual matches with status, names (once revealed) and
 * games won. `linkFor` makes open matches tappable (scorecard); `showGames` adds per-game
 * points (public report) with a neutral state for games in conflict. `publicView` never labels
 * anything as a conflict – it shows "Lota í staðfestingu" instead.
 */
export function MatchList({
  state,
  data,
  linkFor,
  showGames = false,
  publicView = false,
}: {
  state: EncounterState;
  data: EncounterData;
  linkFor?: (matchNumber: number) => string;
  showGames?: boolean;
  publicView?: boolean;
}) {
  return (
    <ul className="list match-list">
      {state.matches.map((m) => (
        <MatchRow key={m.number} match={m} data={data} to={linkFor && TAPPABLE.has(m.status) ? linkFor(m.number) : undefined} showGames={showGames} publicView={publicView} />
      ))}
    </ul>
  );
}

function MatchRow({
  match: m,
  data,
  to,
  showGames,
  publicView,
}: {
  match: MatchState;
  data: EncounterData;
  to?: string;
  showGames: boolean;
  publicView: boolean;
}) {
  const { t } = useTranslation();
  const players = matchParticipants(data, m.number, m.homeSlot, m.awaySlot);
  const names = (ids: string[]) => ids.map((id) => data.names[id] ?? '…').join(' / ');
  const homeLabel = m.kind === 'doubles' ? 'D' : m.homeSlot;
  const awayLabel = m.kind === 'doubles' ? 'D' : m.awaySlot;
  const started = m.status === 'completed' || m.homeGames + m.awayGames > 0;

  const side = (label: string | null, ids: string[], won: boolean) => (
    <span className={`match-row__player${won ? ' match-row__player--won' : ''}`}>
      <span className="match-row__letter">{label}</span>
      <span className="match-row__name">{ids.length ? names(ids) : m.kind === 'doubles' ? t('match.doubles') : '—'}</span>
    </span>
  );

  const body = (
    <>
      <span className="match-row__no num">{m.number}</span>
      <span className="match-row__players">
        {side(homeLabel, players.home, m.winner === 'home')}
        {side(awayLabel, players.away, m.winner === 'away')}
        {showGames && m.games.length > 0 && m.status !== 'not_played' && (
          <span className="match-row__games num">
            {(m.status === 'completed' ? m.games.slice(0, m.homeGames + m.awayGames) : m.games).map((g) =>
              g.status === 'conflict' ? (
                <span key={g.gameNumber} className="match-row__game match-row__game--pending" title={t('match.inConfirmation')}>
                  ?
                </span>
              ) : (
                <span key={g.gameNumber} className="match-row__game">
                  {g.homePoints}–{g.awayPoints}
                </span>
              ),
            )}
          </span>
        )}
        {showGames && m.conflictGames.length > 0 && m.status !== 'not_played' && (
          <span className="match-row__note">{t('match.inConfirmation')}</span>
        )}
      </span>
      <span className="match-row__result">
        {m.status === 'not_played' ? (
          <span className="match-row__status muted">{t('match.notPlayed')}</span>
        ) : started ? (
          <span className={`match-row__score num${m.status === 'completed' ? '' : ' match-row__score--live'}`}>
            {m.homeGames}–{m.awayGames}
          </span>
        ) : null}
        <StatusMark status={m.status} publicView={publicView} />
      </span>
      {to && <ChevronRight size={16} className="match-row__chevron" aria-hidden />}
    </>
  );

  return (
    <li className={`match-row match-row--${m.status}`}>
      {to ? (
        <Link to={to} className="match-row__inner match-row__inner--link">
          {body}
        </Link>
      ) : (
        <div className="match-row__inner">{body}</div>
      )}
    </li>
  );
}

function StatusMark({ status, publicView }: { status: MatchState['status']; publicView: boolean }) {
  const { t } = useTranslation();
  if (status === 'completed' || status === 'not_played') return null;
  if (status === 'locked') {
    return (
      <span className="match-row__status muted">
        <Lock size={12} aria-hidden /> {t('match.status.locked')}
      </span>
    );
  }
  if (status === 'conflict' && publicView) {
    return <span className="match-row__status match-row__status--in_progress">{t('match.status.in_progress')}</span>;
  }
  if (status === 'conflict') {
    return (
      <span className="match-row__status match-row__status--conflict">
        <AlertTriangle size={12} aria-hidden /> {t('match.status.conflict')}
      </span>
    );
  }
  return <span className={`match-row__status match-row__status--${status}`}>{t(`match.status.${status}`)}</span>;
}
