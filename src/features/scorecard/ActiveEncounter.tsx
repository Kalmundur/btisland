import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { Section } from '../../components/List';
import { EncounterHeader } from '../../components/Encounter';
import { LineupView } from '../../components/LineupView';
import { Button } from '../../components/Button';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useEncounterData } from '../../hooks/useEncounterData';
import { leaveRound } from '../../data/roundRepository';
import type { RoundSession } from '../../domain/types';

/**
 * The joined match. Lineup entry and live scoring are built on this in the next phase;
 * the realtime subscription is already in place via useEncounterData.
 */
export function ActiveEncounter({ session, onLeft }: { session: RoundSession; onLeft: () => void }) {
  const { t } = useTranslation();
  const data = useEncounterData(session.encounterId);
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    try {
      await leaveRound(session.id);
      onLeft();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <AsyncBoundary state={data}>
      {({ encounter, lineups, names }) =>
        !encounter ? (
          <EmptyState>{t('live.notFound')}</EmptyState>
        ) : (
          <>
            <EncounterHeader encounter={encounter} highlightTeamId={session.teamId} />
            <Section title={t('scorecard.lineupTitle')}>
              <LineupView encounter={encounter} lineups={lineups} names={names} />
            </Section>
            <Section title={t('scorecard.scoringTitle')}>
              <div className="placeholder">{t('scorecard.scoringComingSoon')}</div>
            </Section>
            <div className="page-actions">
              <Button variant="ghost" size="sm" icon={<LogOut size={16} aria-hidden />} onClick={leave} disabled={leaving}>
                {t('scorecard.leave')}
              </Button>
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}
