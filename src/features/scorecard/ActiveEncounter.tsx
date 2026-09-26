import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { Section } from '../../components/List';
import { EncounterHeader } from '../../components/Encounter';
import { MatchList } from '../../components/MatchList';
import { RejectedEntries } from '../../components/SyncIndicator';
import { useOutbox } from '../../offline/scoreSync';
import { Button } from '../../components/Button';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useDerivedEncounter, useEncounterData, type EncounterData } from '../../hooks/useEncounterData';
import { useAsync } from '../../hooks/useAsync';
import { useLeague } from '../../state/LeagueContext';
import { leaveRound } from '../../data/roundRepository';
import { listTeamPlayers } from '../../data/leagueRepository';
import { confirmDoubles, confirmLineup, proposeDoubles, proposeLineup } from '../../data/encounterRepository';
import { slotsForSide, validateDoubles, validateLineup } from '../../domain/lineup';
import type { LineupSlotLetter, PlayerListItem, RoundSession, TeamSide } from '../../domain/types';
import { OpponentSelectionStatus, OpponentWaiting, SelectionPanel } from './SelectionPanel';
import { DOUBLES_CONFIRMATIONS } from '../../domain/confirmation';
import { ScoreEntry } from './ScoreEntry';
import { ResultPanel, useOutcomeText } from './ResultPanel';

/**
 * The joined encounter. The screen follows the encounter's state:
 *   lineups not both locked -> lineup selection / waiting
 *   revealed                 -> match list (+ focused scoring per match)
 *   matches 1–6 done         -> doubles selection
 *   finished                 -> result confirmation
 *   confirmed                -> read-only report
 */
export function ActiveEncounter({
  session,
  matchNumber,
  onLeft,
}: {
  session: RoundSession;
  matchNumber: number | null;
  onLeft: () => void;
}) {
  const data = useEncounterData(session.encounterId, { withEntries: true });
  const { syncedCount } = useOutbox();
  const { reload } = data;
  useEffect(() => {
    if (syncedCount > 0) reload();
  }, [syncedCount, reload]);
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const roster = useAsync(
    () => (seasonId ? listTeamPlayers(session.teamId, seasonId) : Promise.resolve([])),
    [session.teamId, seasonId],
  );

  return (
    <AsyncBoundary state={data}>
      {(d) => (
        <EncounterFlow
          data={d}
          session={session}
          matchNumber={matchNumber}
          roster={roster.data ?? []}
          reload={data.reload}
          onLeft={onLeft}
        />
      )}
    </AsyncBoundary>
  );
}

function EncounterFlow({
  data,
  session,
  matchNumber,
  roster,
  reload,
  onLeft,
}: {
  data: EncounterData;
  session: RoundSession;
  matchNumber: number | null;
  roster: PlayerListItem[];
  reload: () => void;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  const state = useDerivedEncounter(data);
  const [leaving, setLeaving] = useState(false);
  const encounter = data.encounter;
  const outcome = useOutcomeText(encounter, state);

  if (!encounter || !state) return <EmptyState>{t('live.notFound')}</EmptyState>;

  const mySide: TeamSide = session.teamId === encounter.homeTeamId ? 'home' : 'away';
  const otherSide: TeamSide = mySide === 'home' ? 'away' : 'home';
  const myTeam = mySide === 'home' ? encounter.homeTeamName : encounter.awayTeamName;
  const otherTeam = mySide === 'home' ? encounter.awayTeamName : encounter.homeTeamName;
  const revealed = !!encounter.lineupsRevealedAt;
  const official = encounter.status === 'completed';
  const names = { ...Object.fromEntries(roster.map((p) => [p.id, p.fullName])), ...data.names };

  if (matchNumber && revealed && matchNumber >= 1 && matchNumber <= 10) {
    return <ScoreEntry data={{ ...data, names }} state={state} matchNumber={matchNumber} myPlayerId={session.playerId} />;
  }

  const leave = async () => {
    setLeaving(true);
    try {
      await leaveRound(session.id);
      onLeft();
    } finally {
      setLeaving(false);
    }
  };

  // Own lineup / doubles --------------------------------------------------------------
  const myLineup = data.lineups.find((l) => l.side === mySide);
  const otherLineup = data.lineups.find((l) => l.side === otherSide);
  const letters = slotsForSide(mySide);
  const lineupCurrent = Object.fromEntries(letters.map((l) => [l, myLineup?.slots.find((s) => s.slot === l)?.playerId]));

  const myDoubles = data.doubles.find((d) => d.side === mySide);
  const otherDoubles = data.doubles.find((d) => d.side === otherSide);
  const doublesCurrent = { '1': myDoubles?.playerIds[0], '2': myDoubles?.playerIds[1] };
  const rosterIds = roster.map((p) => p.id);

  const lineupPanel = (
    <>
      <SelectionPanel
        title={`${t('selection.lineupTitle')} · ${myTeam}`}
        slots={letters}
        roster={roster}
        selection={myLineup}
        current={lineupCurrent}
        myPlayerId={session.playerId}
        names={names}
        lockedLabel={t('selection.lineupLocked')}
        readyLabel={t('selection.lineupReady')}
        validate={(draft) => validateLineup(mySide, draft as Partial<Record<LineupSlotLetter, string>>)}
        onPropose={async (draft) => {
          await proposeLineup(encounter.id, draft as Partial<Record<LineupSlotLetter, string>>);
          reload();
        }}
        onConfirm={async (version) => {
          await confirmLineup(myLineup!.id, version);
          reload();
        }}
      />
      {myLineup?.lockedAt && !otherLineup?.lockedAt ? (
        <OpponentWaiting detail={t('selection.waitingLineup', { team: otherTeam })} />
      ) : (
        <OpponentSelectionStatus
          label={t('selection.opponent', { team: otherTeam })}
          selection={otherLineup}
          missingLabel={t('selection.lineupMissing')}
          lockedLabel={t('selection.lineupLocked')}
          hiddenNote={t('selection.lineupHidden')}
        />
      )}
    </>
  );

  const doublesPanel = (
    <Section title={t('selection.doublesTitle')}>
      <p className="lead">{t('selection.doublesIntro')}</p>
      <SelectionPanel
        title={myTeam}
        slots={['1', '2']}
        roster={roster}
        selection={myDoubles}
        current={doublesCurrent}
        myPlayerId={session.playerId}
        names={names}
        lockedLabel={t('selection.doublesLocked')}
        readyLabel={t('selection.doublesReady')}
        requiredConfirmations={DOUBLES_CONFIRMATIONS}
        validate={(draft) => validateDoubles([draft['1'], draft['2']], rosterIds)}
        onPropose={async (draft) => {
          await proposeDoubles(encounter.id, draft['1'], draft['2']);
          reload();
        }}
        onConfirm={async (version) => {
          await confirmDoubles(myDoubles!.id, version);
          reload();
        }}
      />
      {myDoubles?.lockedAt && !otherDoubles?.lockedAt ? (
        <OpponentWaiting detail={t('selection.waitingDoubles', { team: otherTeam })} />
      ) : (
        <OpponentSelectionStatus
          label={t('selection.opponent', { team: otherTeam })}
          selection={otherDoubles}
          missingLabel={t('selection.doublesMissing')}
          lockedLabel={t('selection.doublesLocked')}
          hiddenNote={t('selection.doublesHidden')}
          requiredConfirmations={DOUBLES_CONFIRMATIONS}
        />
      )}
    </Section>
  );

  return (
    <>
      <EncounterHeader
        encounter={encounter}
        highlightTeamId={session.teamId}
        score={revealed ? { home: state.homeScore, away: state.awayScore } : null}
        note={outcome}
        compact
      />
      <RejectedEntries />

      {!revealed ? (
        lineupPanel
      ) : (
        <>
          {(state.finished || official) && (
            <ResultPanel
              encounter={encounter}
              state={state}
              confirmations={data.confirmations}
              mySide={mySide}
              names={names}
              onChanged={reload}
            />
          )}
          {state.doublesSelectionOpen && !encounter.doublesRevealedAt && !official && doublesPanel}
          <Section className="section--plain" title={official || state.finished ? t('result.report') : t('match.pickMatch')}>
            <MatchList
              state={state}
              data={{ ...data, names }}
              linkFor={official ? undefined : (n) => `/scorecard/match/${n}`}
              showGames={official || state.finished}
            />
          </Section>
        </>
      )}

      <div className="page-actions page-actions--utility">
        <Button variant="ghost" size="sm" icon={<LogOut size={16} aria-hidden />} onClick={() => void leave()} disabled={leaving}>
          {t('scorecard.leave')}
        </Button>
      </div>
    </>
  );
}
