import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { Link, useNavigationType, useParams } from 'react-router';
import { ChevronDown } from 'lucide-react';
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
import { formatDate, formatShortDate, formatTime } from '../../lib/format';
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
        <AsyncBoundary state={data}>
          {(d) => (d ? <RoundTimeline key={d.league.division.id} data={d} /> : <EmptyState>{t('standings.noSeason')}</EmptyState>)}
        </AsyncBoundary>
      </div>
    </>
  );
}

/**
 * Accordion state that must outlive the page (opening a match and coming back unmounts it):
 * the open round (null = all collapsed) and scroll position per division. Only back
 * navigation reads them.
 */
const openRoundByDivision = new Map<string, string | null>();
/** Open/close transition length – keep in sync with .round-acc__panel in league.css. */
const ACCORDION_MS = 220;
const timelineScroll = new Map<string, number>();

function pageHeaderHeight(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-header-h')) || 0;
}

/**
 * Every round once, in numeric order, as an accordion with at most one round open (zero is
 * allowed). The default open round (in progress → next upcoming → latest finished) is chosen
 * once per division on arrival; afterwards only the user changes it – realtime updates never
 * move the view or the selection.
 */
function RoundTimeline({ data }: { data: LeagueData }) {
  const navigationType = useNavigationType();
  const divisionId = data.league.division.id;
  const rounds = [...data.rounds].sort((a, b) => a.number - b.number);
  const inRound = (r: Round) => data.encounters.filter((e) => e.roundId === r.id);
  const headerRefs = useRef(new Map<string, HTMLElement>());
  const isBack = navigationType === 'POP';

  // Initial selection only (state initialiser runs once per mount; the parent keys by division).
  const [openId, setOpenId] = useState<string | null>(() => {
    if (isBack && openRoundByDivision.has(divisionId)) {
      const saved = openRoundByDivision.get(divisionId) ?? null;
      if (saved === null || data.rounds.some((r) => r.id === saved)) return saved;
    }
    return focusRound(data.rounds, data.encounters, todayInIceland())?.id ?? null;
  });
  useEffect(() => {
    openRoundByDivision.set(divisionId, openId);
  }, [divisionId, openId]);

  // Arrival (before first paint): back navigation restores the scroll position, any other
  // arrival brings the open round's header to the top.
  useLayoutEffect(() => {
    const saved = timelineScroll.get(divisionId);
    if (isBack && saved !== undefined) {
      window.scrollTo(0, saved);
      return;
    }
    const el = openId ? headerRefs.current.get(openId) : undefined;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - pageHeaderHeight();
    window.scrollTo(0, Math.max(0, top));
    // Deliberately runs once per mount (= per division), never on data updates.
  }, []);

  // Switching rounds: the round above may collapse (animated), so keep the tapped header where
  // it was for the length of the transition. A ResizeObserver runs after each frame's layout and
  // before paint, so the correction lands in the same frame (no visible drift). Any touch/wheel
  // hands control back to the user.
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    const el = a ? headerRefs.current.get(a.id) : undefined;
    if (!a || !el || !listRef.current || typeof ResizeObserver === 'undefined') return;
    const hold = () => {
      const shift = el.getBoundingClientRect().top - a.top;
      if (shift !== 0) window.scrollBy(0, shift);
    };
    const observer = new ResizeObserver(hold);
    listRef.current.querySelectorAll('.round-acc__panel').forEach((panel) => observer.observe(panel));
    const stop = () => observer.disconnect();
    const timer = window.setTimeout(stop, ACCORDION_MS + 100);
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    return () => {
      stop();
      window.clearTimeout(timer);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
  }, [openId]);

  // Tapping the open round collapses it (all rounds closed); any other round replaces it.
  const toggle = (id: string) => {
    const el = headerRefs.current.get(id);
    anchor.current = el ? { id, top: el.getBoundingClientRect().top } : null;
    setOpenId(id === openId ? null : id);
  };

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
    <div className="round-acc" ref={listRef}>
      {rounds.map((r) => (
        <AccordionRound
          key={r.id}
          round={r}
          encounters={inRound(r)}
          expanded={r.id === openId}
          onToggle={() => toggle(r.id)}
          headerRef={(el) => {
            if (el) headerRefs.current.set(r.id, el);
            else headerRefs.current.delete(r.id);
          }}
        />
      ))}
    </div>
  );
}

function AccordionRound({
  round,
  encounters,
  expanded,
  onToggle,
  headerRef,
}: {
  round: Round;
  encounters: EncounterDetail[];
  expanded: boolean;
  onToggle: () => void;
  headerRef: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const status = deriveRoundStatus(encounters);
  const time = formatTime(round.startTime);
  const buttonId = `round-${round.id}`;
  const panelId = `round-panel-${round.id}`;

  return (
    <section className={`round-acc__item${expanded ? ' round-acc__item--open' : ''}`}>
      <h2 className="round-acc__heading">
        <button
          type="button"
          id={buttonId}
          ref={headerRef}
          className="round-acc__header"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="round-acc__text">
            <span className="round-acc__title">{t('round.label', { number: round.number })}</span>
            <span className="round-acc__meta">
              {formatShortDate(round.date)}
              {' · '}
              <span className={`round-acc__status round-acc__status--${status}`}>{t(`roundStatus.${status}`)}</span>
            </span>
          </span>
          <ChevronDown className="round-acc__chevron" size={18} aria-hidden />
        </button>
      </h2>
      {/* Always rendered so it can animate open and closed; inert (not focusable/announced) while closed. */}
      <div id={panelId} role="region" aria-labelledby={buttonId} className="round-acc__panel" inert={!expanded}>
        <div className="round-acc__clip">
          <div className="round-acc__content">
            <p className="round-acc__detail">
              {formatDate(round.date)}
              {time ? ` · ${time}` : ''}
            </p>
            {round.venue && <p className="round-acc__detail">{round.venue}</p>}
            {encounters.length === 0 ? (
              <p className="note">{t('live.noEncounters')}</p>
            ) : (
              <ul className="list round-acc__matches">
                {encounters.map((e) => (
                  <EncounterRow
                    key={e.id}
                    encounter={e}
                    // The score says it all while a match is on; only states the score can't show get a line.
                    showStatus={e.status === 'awaiting_confirmation' || e.status === 'postponed' || e.status === 'cancelled'}
                    quietStatus
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
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
