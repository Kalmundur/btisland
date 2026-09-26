import { useEffect, useLayoutEffect, useRef, type Ref } from 'react';
import { Link, useNavigationType, useParams } from 'react-router';
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
import { deriveRoundStatus, focusRound } from '../../domain/rounds';
import { todayInIceland } from '../../domain/activeSession';
import { formatDate, formatTime } from '../../lib/format';
import type { EncounterDetail, Round } from '../../domain/types';
import { OpponentSelectionStatus } from '../scorecard/SelectionPanel';
import { useOutcomeText } from '../scorecard/ResultPanel';

/**
 * /live – the whole season as one chronological timeline (Umferð 1 … 10, each once).
 * The page opens at the most relevant round; earlier rounds are above, later below.
 */
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
        <AsyncBoundary state={data}>{(d) => (d ? <RoundTimeline data={d} /> : <EmptyState>{t('standings.noSeason')}</EmptyState>)}</AsyncBoundary>
      </div>
    </>
  );
}

/** Scroll position of the timeline per division, so coming back from a match restores it. */
const timelineScroll = new Map<string, number>();

function pageHeaderHeight(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-header-h')) || 0;
}

function RoundTimeline({ data }: { data: LeagueData }) {
  const navigationType = useNavigationType();
  const divisionId = data.league.division.id;
  const rounds = [...data.rounds].sort((a, b) => a.number - b.number);
  const inRound = (r: Round) => data.encounters.filter((e) => e.roundId === r.id);
  const roundRefs = useRef(new Map<string, HTMLElement>());
  // Which division the view has been positioned for – realtime updates re-render this
  // component with fresh data but never move the view again.
  const positionedFor = useRef<string | null>(null);

  // Before the first paint (no visible jump): back navigation restores the saved position,
  // any other arrival opens at the most relevant round.
  useLayoutEffect(() => {
    if (positionedFor.current === divisionId) return;
    positionedFor.current = divisionId;
    const saved = timelineScroll.get(divisionId);
    if (navigationType === 'POP' && saved !== undefined) {
      window.scrollTo(0, saved);
      return;
    }
    const focus = focusRound(data.rounds, data.encounters, todayInIceland());
    const el = focus ? roundRefs.current.get(focus.id) : undefined;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - pageHeaderHeight();
    window.scrollTo(0, Math.max(0, top));
    // data and navigationType are deliberately read once per division, not on every update.
  }, [divisionId]);

  // Remember where the user is while they browse this page (ignore scrolls after leaving).
  useEffect(() => {
    const path = window.location.pathname;
    const save = () => {
      if (window.location.pathname === path) timelineScroll.set(divisionId, window.scrollY);
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [divisionId]);

  return (
    <div className="timeline">
      {rounds.map((r) => (
        <TimelineRound
          key={r.id}
          round={r}
          encounters={inRound(r)}
          ref={(el) => {
            if (el) roundRefs.current.set(r.id, el);
            else roundRefs.current.delete(r.id);
          }}
        />
      ))}
    </div>
  );
}

function TimelineRound({ round, encounters, ref }: { round: Round; encounters: EncounterDetail[]; ref: Ref<HTMLElement> }) {
  const { t } = useTranslation();
  const status = deriveRoundStatus(encounters);
  const time = formatTime(round.startTime);
  const headingId = `round-${round.id}`;
  return (
    <section className="timeline-round" ref={ref} aria-labelledby={headingId}>
      <div className="timeline-round__head">
        <h2 id={headingId} className="timeline-round__title">
          <Link to={`/live/round/${round.id}`}>{t('round.label', { number: round.number })}</Link>
        </h2>
        <span className={`timeline-round__status timeline-round__status--${status}`}>{t(`roundStatus.${status}`)}</span>
      </div>
      <p className="timeline-round__meta">
        {formatDate(round.date)}
        {time ? ` · ${time}` : ''}
      </p>
      {round.venue && <p className="timeline-round__meta">{round.venue}</p>}
      {encounters.length === 0 ? (
        <p className="note">{t('live.noEncounters')}</p>
      ) : (
        <ul className="list timeline-round__matches">
          {encounters.map((e) => (
            <EncounterRow
              key={e.id}
              encounter={e}
              showStatus={e.status !== 'scheduled' && e.status !== 'completed'}
              quietStatus
            />
          ))}
        </ul>
      )}
    </section>
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
            <PageHeader title={t('live.notFound')} back backTo="/schedule" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader
              title={t('round.label', { number: d.round.number })}
              subtitle={d.division ? `${d.division.name} · ${d.division.season?.name ?? ''}` : undefined}
              back
              backTo="/schedule"
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
      <PageHeader title={t('live.matchTitle')} back backTo="/schedule" actions={<ShareButton title={title} />} />
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
          <MatchList state={state} data={data} publicView />
          <p className="note">{t('live.expandHint')}</p>
        </Section>
      )}
    </>
  );
}
