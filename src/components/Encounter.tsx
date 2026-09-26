import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { EncounterDetail, EncounterStatus } from '../domain/types';
import { formatDate, formatDayMonthYear, formatShortDate, formatTime } from '../lib/format';

export function StatusBadge({ status }: { status: EncounterStatus }) {
  const { t } = useTranslation();
  return <span className={`badge badge--${status}`}>{t(`status.${status}`)}</span>;
}

function hasScore(e: EncounterDetail) {
  return e.homeScore != null && e.awayScore != null;
}

/**
 * Compact schedule/result row: home – score – away.
 * `showStatus` adds a status line (with an optional conflict count, e.g. for organizers);
 * `quietStatus` shows it as small text under the score instead of a badge (live timeline).
 */
export function EncounterRow({
  encounter,
  showDate,
  showStatus,
  quietStatus = false,
  conflicts = 0,
  to,
}: {
  encounter: EncounterDetail;
  showDate?: boolean;
  showStatus?: boolean;
  quietStatus?: boolean;
  conflicts?: number;
  to?: string;
}) {
  const { t } = useTranslation();
  const e = encounter;
  const live = e.status === 'in_progress' || e.status === 'lineups' || e.status === 'awaiting_confirmation';
  const scored = hasScore(e) && e.status !== 'scheduled';
  const scoreClass = live ? ' enc-row__score--live' : scored ? ' enc-row__score--final' : ' enc-row__score--vs';
  return (
    <li>
      <Link to={to ?? `/live/match/${e.id}`} className="enc-row">
        <span className="enc-row__team enc-row__team--home">{e.homeTeamName}</span>
        <span className={`enc-row__score num${scoreClass}`}>
          {scored ? `${e.homeScore}–${e.awayScore}` : showDate ? formatShortDate(e.round.date) : t('common.vs')}
        </span>
        <span className="enc-row__team enc-row__team--away">{e.awayTeamName}</span>
        {showStatus && (
          <span className="enc-row__meta">
            {quietStatus ? (
              <span className={`enc-row__status enc-row__status--${e.status}`}>{t(`status.${e.status}`)}</span>
            ) : (
              <StatusBadge status={e.status} />
            )}
            {conflicts > 0 && <span className="enc-row__conflicts">{t('live.conflicts', { count: conflicts })}</span>}
          </span>
        )}
      </Link>
    </li>
  );
}

/** Long public status line for finished/closed encounters. */
export function useStatusLine(status: EncounterStatus): string | null {
  const { t } = useTranslation();
  switch (status) {
    case 'awaiting_confirmation':
      return t('live.awaitingConfirmation');
    case 'completed':
      return t('live.resultConfirmed');
    case 'postponed':
      return t('status.postponed');
    case 'cancelled':
      return t('status.cancelled');
    default:
      return null;
  }
}

/** Large match header used on the scorecard and match pages. `score` overrides the stored score (live screens pass the derived score). */
export function EncounterHeader({
  encounter,
  highlightTeamId,
  score,
  note,
  compact = false,
}: {
  encounter: EncounterDetail;
  highlightTeamId?: string;
  score?: { home: number; away: number } | null;
  note?: ReactNode;
  /**
   * Before there is a score: three left-aligned rows – who (Home – Away), when
   * (Umferð · date · time) and where. Routine statuses (scheduled, lineups) are left out.
   */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const e = encounter;
  const shown = score ?? (hasScore(e) ? { home: e.homeScore!, away: e.awayScore! } : null);
  const time = formatTime(e.round.startTime);
  const side = (name: string, teamId: string) => (
    <Link
      to={`/team/${teamId}`}
      className={`match-head__team${highlightTeamId === teamId ? ' match-head__team--mine' : ''}`}
    >
      {name}
    </Link>
  );

  if (compact && !shown) {
    const quietStatus = e.status === 'scheduled' || e.status === 'lineups';
    const when = [
      t('round.label', { number: e.round.number }),
      !quietStatus && t(`status.${e.status}`),
      formatDayMonthYear(e.round.date),
      time,
    ].filter(Boolean);
    return (
      <div className="match-head match-head--compact">
        <h2 className="match-head__matchup">
          {side(e.homeTeamName, e.homeTeamId)}
          <span className="match-head__sep"> – </span>
          {side(e.awayTeamName, e.awayTeamId)}
        </h2>
        <p className="match-head__when">{when.join(' · ')}</p>
        {e.round.venue && <p className="match-head__venue">{e.round.venue}</p>}
        {note && <p className="match-head__note">{note}</p>}
      </div>
    );
  }

  return (
    <div className="match-head">
      <p className="match-head__meta">
        {t('round.label', { number: e.round.number })}
        {' · '}
        <span className={`match-head__status match-head__status--${e.status}`}>{t(`status.${e.status}`)}</span>
      </p>
      <div className={`match-head__teams match-head__teams--${shown ? 'score' : 'vs'}`}>
        {side(e.homeTeamName, e.homeTeamId)}
        {shown ? (
          <span className="match-head__score num">
            {shown.home}
            <span className="match-head__dash">–</span>
            {shown.away}
          </span>
        ) : (
          // Own column (not inside the score's display-size line box) so it centres on the names.
          <span className="match-head__vs">{t('common.vs')}</span>
        )}
        {side(e.awayTeamName, e.awayTeamId)}
      </div>
      {note && <p className="match-head__note">{note}</p>}
      <p className="match-head__where">
        {formatDate(e.round.date)} · {time ?? t('common.tba')}
        {e.round.venue && (
          <>
            <br />
            {e.round.venue}
          </>
        )}
      </p>
    </div>
  );
}
