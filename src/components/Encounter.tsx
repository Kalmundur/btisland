import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { EncounterDetail, EncounterStatus } from '../domain/types';
import { SLOT_LETTERS } from '../domain/lineup';
import { formatDate, formatShortDate, formatTime } from '../lib/format';

export function StatusBadge({ status }: { status: EncounterStatus }) {
  const { t } = useTranslation();
  return <span className={`badge badge--${status}`}>{t(`status.${status}`)}</span>;
}

function hasScore(e: EncounterDetail) {
  return e.homeScore != null && e.awayScore != null;
}

/** Compact schedule/result row: home – score – away. */
export function EncounterRow({ encounter, showDate }: { encounter: EncounterDetail; showDate?: boolean }) {
  const { t } = useTranslation();
  const e = encounter;
  const live = e.status === 'in_progress' || e.status === 'lineups' || e.status === 'awaiting_confirmation';
  return (
    <li>
      <Link to={`/live/match/${e.id}`} className="enc-row">
        <span className="enc-row__team enc-row__team--home">{e.homeTeamName}</span>
        <span className={`enc-row__score num${live ? ' enc-row__score--live' : ''}`}>
          {hasScore(e) ? `${e.homeScore}–${e.awayScore}` : showDate ? formatShortDate(e.round.date) : t('common.vs')}
        </span>
        <span className="enc-row__team enc-row__team--away">{e.awayTeamName}</span>
      </Link>
    </li>
  );
}

/** Large match header used on the scorecard and match pages. `score` overrides the stored score (live screens pass the derived score). */
export function EncounterHeader({
  encounter,
  highlightTeamId,
  score,
  note,
}: {
  encounter: EncounterDetail;
  highlightTeamId?: string;
  score?: { home: number; away: number } | null;
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  const e = encounter;
  const shown = score ?? (hasScore(e) ? { home: e.homeScore!, away: e.awayScore! } : null);
  const time = formatTime(e.round.startTime);
  const side = (name: string, teamId: string, letters: readonly string[]) => (
    <Link
      to={`/team/${teamId}`}
      className={`match-head__team${highlightTeamId === teamId ? ' match-head__team--mine' : ''}`}
    >
      <span className="match-head__name">{name}</span>
      <span className="match-head__letters">{letters.join(' ')}</span>
    </Link>
  );

  return (
    <div className="match-head">
      <div className="match-head__meta">
        <span className="match-head__round">{t('round.label', { number: e.round.number })}</span>
        <StatusBadge status={e.status} />
      </div>
      <div className="match-head__teams">
        {side(e.homeTeamName, e.homeTeamId, SLOT_LETTERS.home)}
        <span className="match-head__score num">
          {shown ? (
            <>
              {shown.home}
              <span className="match-head__dash">–</span>
              {shown.away}
            </>
          ) : (
            <span className="match-head__vs">{t('common.vs')}</span>
          )}
        </span>
        {side(e.awayTeamName, e.awayTeamId, SLOT_LETTERS.away)}
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
