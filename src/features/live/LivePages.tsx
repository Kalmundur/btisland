import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { Section } from '../../components/List';
import { EncounterHeader, EncounterRow, useStatusLine } from '../../components/Encounter';
import { MatchList } from '../../components/MatchList';
import { ShareButton } from '../../components/ShareButton';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useLeagueData, type LeagueData } from '../../hooks/useLeagueData';
import { useDerivedEncounter, useEncounterData, type EncounterData } from '../../hooks/useEncounterData';
import { getDivision, getRound, listRoundEncounters } from '../../data/leagueRepository';
import { subscribeToEncounterSet } from '../../data/encounterRepository';
import { deriveRoundStatus, liveOverview } from '../../domain/rounds';
import { todayInIceland } from '../../domain/activeSession';
import { formatDate, formatTime } from '../../lib/format';
import type { EncounterDetail, Round } from '../../domain/types';
import { OpponentSelectionStatus } from '../scorecard/SelectionPanel';
import { useOutcomeText } from '../scorecard/ResultPanel';

/** /live – public landing: in progress now, next round, recent results, all rounds. */
export function LivePage() {
  const { t } = useTranslation();
  const data = useLeagueData();
  return (
    <>
      <PageHeader
        title={t('live.title')}
        subtitle={data.data ? `${data.data.league.division.name} · ${data.data.league.season.name}` : undefined}
        actions={<ShareButton title={t('live.title')} />}
      />
      <div className="page">
        <AsyncBoundary state={data}>{(d) => (d ? <LiveOverview data={d} /> : <EmptyState>{t('standings.noSeason')}</EmptyState>)}</AsyncBoundary>
      </div>
    </>
  );
}

function RoundBlock({ round, encounters }: { round: Round; encounters: EncounterDetail[] }) {
  const { t } = useTranslation();
  return (
    <div className="round-block">
      <Link to={`/live/round/${round.id}`} className="round-block__head">
        <span className="round-block__title">{t('round.label', { number: round.number })}</span>
        <span className="round-block__meta">
          {formatDate(round.date)}
          {round.venue ? ` · ${round.venue}` : ''}
        </span>
      </Link>
      <ul className="list">
        {encounters.map((e) => (
          <EncounterRow key={e.id} encounter={e} showStatus={e.status !== 'scheduled' && e.status !== 'completed'} />
        ))}
      </ul>
    </div>
  );
}

function LiveOverview({ data }: { data: LeagueData }) {
  const { t } = useTranslation();
  const overview = liveOverview(data.rounds, data.encounters, todayInIceland());
  const inRound = (r: Round) => data.encounters.filter((e) => e.roundId === r.id);
  const statusOf = (r: Round) => deriveRoundStatus(inRound(r));

  return (
    <>
      <Section title={t('live.active')}>
        {overview.active.length === 0 ? (
          <p className="note">{t('live.noActive')}</p>
        ) : (
          <ul className="list">
            {overview.active.map((e) => (
              <EncounterRow key={e.id} encounter={e} showStatus />
            ))}
          </ul>
        )}
      </Section>

      {overview.upcoming && (
        <Section title={t('live.upcoming')}>
          <RoundBlock round={overview.upcoming} encounters={inRound(overview.upcoming)} />
        </Section>
      )}

      {overview.recent.length > 0 && (
        <Section title={t('live.recent')}>
          {overview.recent.map((r) => (
            <RoundBlock key={r.id} round={r} encounters={inRound(r)} />
          ))}
        </Section>
      )}

      <Section title={t('live.allRounds')}>
        <ul className="list">
          {data.rounds.map((r) => (
            <li key={r.id}>
              <Link to={`/live/round/${r.id}`} className="round-row">
                <span className="round-row__no num">{r.number}</span>
                <span className="round-row__main">
                  <span className="round-row__date">{formatDate(r.date)}</span>
                  <span className="round-row__venue">{r.venue}</span>
                </span>
                <span className={`round-status round-status--${statusOf(r)}`}>{t(`roundStatus.${statusOf(r)}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** /live/round/:roundId – permanent, shareable round page with live scores. */
export function RoundPage() {
  const { t } = useTranslation();
  const { roundId = '' } = useParams();
  const data = useAsync(async () => {
    const round = await getRound(roundId);
    if (!round) return null;
    const [encounters, division] = await Promise.all([listRoundEncounters(roundId), getDivision(round.divisionId)]);
    return { round, encounters, division };
  }, [roundId]);

  const ids = data.data?.encounters.map((e) => e.id).join(',') ?? '';
  const { reload } = data;
  useEffect(() => (ids ? subscribeToEncounterSet(ids.split(','), reload) : undefined), [ids, reload]);

  return (
    <AsyncBoundary state={data}>
      {(d) =>
        !d ? (
          <>
            <PageHeader title={t('live.notFound')} back backTo="/live" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader
              title={t('round.label', { number: d.round.number })}
              subtitle={d.division ? `${d.division.name} · ${d.division.season?.name ?? ''}` : undefined}
              back
              backTo="/live"
              actions={<ShareButton title={`${t('round.label', { number: d.round.number })} · ${d.division?.name ?? ''}`} />}
            />
            <div className="page">
              <div className="round-info">
                <span className={`round-status round-status--${deriveRoundStatus(d.encounters)}`}>
                  {t(`roundStatus.${deriveRoundStatus(d.encounters)}`)}
                </span>
                <p>
                  {formatDate(d.round.date)} · {formatTime(d.round.startTime) ?? t('common.tba')}
                </p>
                {d.round.venue && <p className="muted">{d.round.venue}</p>}
              </div>
              {d.encounters.length === 0 ? (
                <EmptyState>{t('live.noEncounters')}</EmptyState>
              ) : (
                <ul className="list">
                  {d.encounters.map((e) => (
                    <EncounterRow key={e.id} encounter={e} showStatus />
                  ))}
                </ul>
              )}
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}

/** /live/match/:encounterId – public live match report, updated in realtime. */
export function MatchPage() {
  const { t } = useTranslation();
  const { encounterId = '' } = useParams();
  const data = useEncounterData(encounterId);
  const title = data.data?.encounter ? `${data.data.encounter.homeTeamName} – ${data.data.encounter.awayTeamName}` : t('live.matchTitle');

  return (
    <>
      <PageHeader title={t('live.matchTitle')} back backTo="/live" actions={<ShareButton title={title} />} />
      <div className="page">
        <AsyncBoundary state={data}>{(d) => <PublicMatch data={d} />}</AsyncBoundary>
      </div>
    </>
  );
}

function PublicMatch({ data }: { data: EncounterData }) {
  const { t } = useTranslation();
  const state = useDerivedEncounter(data);
  const outcome = useOutcomeText(data.encounter, state);
  const statusLine = useStatusLine(data.encounter?.status ?? 'scheduled');
  const encounter = data.encounter;
  if (!encounter || !state) return <EmptyState>{t('live.notFound')}</EmptyState>;
  const revealed = !!encounter.lineupsRevealedAt;

  return (
    <>
      <EncounterHeader
        encounter={encounter}
        score={revealed ? { home: state.homeScore, away: state.awayScore } : null}
        note={
          outcome || statusLine ? (
            <>
              {outcome}
              {outcome && statusLine && <br />}
              {statusLine && <span className={`status-line status-line--${encounter.status}`}>{statusLine}</span>}
            </>
          ) : undefined
        }
      />
      <Link to={`/live/round/${encounter.roundId}`} className="back-link">
        {t('round.label', { number: encounter.round.number })} · {formatDate(encounter.round.date)}
      </Link>
      {!revealed ? (
        <Section title={t('scorecard.lineupTitle')}>
          {(['home', 'away'] as const).map((side) => (
            <OpponentSelectionStatus
              key={side}
              label={side === 'home' ? encounter.homeTeamName : encounter.awayTeamName}
              selection={data.lineups.find((l) => l.side === side)}
              missingLabel={t('selection.lineupMissing')}
              lockedLabel={t('selection.lineupLocked')}
              hiddenNote=""
            />
          ))}
          <p className="note">{t('live.lineupsHidden')}</p>
        </Section>
      ) : (
        <Section title={t('live.games')}>
          {state.phase1Complete && !encounter.doublesRevealedAt && !state.decided && (
            <p className="note">{t('match.doublesPending')}</p>
          )}
          <MatchList state={state} data={data} publicView />
          <p className="note">{t('live.expandHint')}</p>
        </Section>
      )}
    </>
  );
}
