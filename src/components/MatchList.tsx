import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { matchPhaseGroups, type EncounterState, type MatchState } from '../domain/encounterState';
import { matchParticipants, type EncounterData } from '../hooks/useEncounterData';

const TAPPABLE = new Set(['available', 'in_progress', 'conflict', 'completed']);

/**
 * The ten individual matches laid out like a scoresheet: "Leikir 1–6", "Tvíliðaleikur",
 * "Leikir 8–10". A phase that hasn't opened yet says so once in its heading ("eftir leiki
 * 1–6"); its rows are plain schedule lines – no lock icons.
 *
 * `linkFor` makes open matches tappable (scorecard); `showGames` adds per-game points;
 * `publicView` expands game scores on tap and never labels anything as a conflict.
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
  const { t } = useTranslation();
  const titles: Record<number, string> = { 1: t('match.phase1'), 2: t('match.phase2'), 3: t('match.phase3') };
  const waitingNotes: Record<number, string> = { 2: t('match.afterPhase1'), 3: t('match.afterDoubles') };

  return (
    <div className="match-list">
      {matchPhaseGroups(state).map((group) => {
        // Once 1–6 are done the doubles wait only for the pairs – the row itself says so.
        const note = group.waiting && !(group.phase === 2 && state.phase1Complete) ? waitingNotes[group.phase] : undefined;
        return (
          <section key={group.phase} className="match-group" aria-label={titles[group.phase]}>
            <h3 className="match-group__title">
              {titles[group.phase]}
              {note && <span className="match-group__note"> · {note}</span>}
            </h3>
            <ul className="list">
              {group.matches.map((m) => (
                <MatchRow
                  key={m.number}
                  match={m}
                  data={data}
                  phase1Complete={state.phase1Complete}
                  to={linkFor && TAPPABLE.has(m.status) ? linkFor(m.number) : undefined}
                  showGames={showGames}
                  publicView={publicView}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MatchRow({
  match: m,
  data,
  phase1Complete,
  to,
  showGames,
  publicView,
}: {
  match: MatchState;
  data: EncounterData;
  phase1Complete: boolean;
  to?: string;
  showGames: boolean;
  publicView: boolean;
}) {
  const { t } = useTranslation();
  const players = matchParticipants(data, m.number, m.homeSlot, m.awaySlot);
  const names = (ids: string[]) => ids.map((id) => data.names[id] ?? '…').join(' / ');
  const started = m.status === 'completed' || m.homeGames + m.awayGames > 0;
  // Public view: game scores on expand. Scorecard/admin: always visible when requested.
  const expandable = publicView && m.games.length > 0 && m.status !== 'not_played';
  const [open, setOpen] = useState(false);
  const gamesVisible = expandable ? open : showGames;
  // Doubles pairs are unknown until both teams have chosen: one plain line instead of "D / D".
  const pairsUnknown = m.kind === 'doubles' && players.home.length === 0 && players.away.length === 0;

  const side = (label: string | null, ids: string[], won: boolean) => (
    <span className={`match-row__player${won ? ' match-row__player--won' : ''}`}>
      <span className="match-row__letter">{label}</span>
      <span className="match-row__name">{ids.length ? names(ids) : '—'}</span>
    </span>
  );

  const body = (
    <>
      <span className="match-row__no num">{m.number}</span>
      <span className="match-row__players">
        {pairsUnknown ? (
          <span className="match-row__pending">
            {m.status === 'not_played' ? t('match.doubles') : phase1Complete ? t('match.pairsBeingChosen') : t('match.pairsChosenLater')}
          </span>
        ) : (
          <>
            {side(m.kind === 'doubles' ? 'D' : m.homeSlot, players.home, m.winner === 'home')}
            {side(m.kind === 'doubles' ? 'D' : m.awaySlot, players.away, m.winner === 'away')}
          </>
        )}
        {gamesVisible && m.games.length > 0 && m.status !== 'not_played' && (
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
        {(gamesVisible || publicView) && m.conflictGames.length > 0 && m.status !== 'not_played' && (
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
        <StatusMark status={m.status} publicView={publicView} linked={!!to} />
      </span>
      {to && <ChevronRight size={16} className="match-row__chevron" aria-hidden />}
      {expandable && <ChevronDown size={16} className={`match-row__chevron${open ? ' match-row__chevron--open' : ''}`} aria-hidden />}
    </>
  );

  return (
    <li className={`match-row match-row--${m.status}`}>
      {to ? (
        <Link to={to} className="match-row__inner match-row__inner--link">
          {body}
        </Link>
      ) : expandable ? (
        <button type="button" className="match-row__inner match-row__inner--link match-row__inner--button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {body}
        </button>
      ) : (
        <div className="match-row__inner">{body}</div>
      )}
    </li>
  );
}

/**
 * Status mark for open/finished matches. Waiting matches get none – their heading explains it.
 * A tappable open match needs no label: its chevron already says it can be opened.
 */
function StatusMark({ status, publicView, linked }: { status: MatchState['status']; publicView: boolean; linked: boolean }) {
  const { t } = useTranslation();
  if (status === 'completed') {
    return <Check size={14} strokeWidth={2.5} className="match-row__done" aria-label={t('match.status.completed')} />;
  }
  if (status === 'not_played' || status === 'locked') return null;
  if (status === 'available' && linked) return null;
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
