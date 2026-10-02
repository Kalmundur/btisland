import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { AsyncBoundary, ErrorState, LoadingState, NotConfigured } from '../../components/StateViews';
import { useAuth } from '../../state/AuthContext';
import { useProfile } from '../../state/ProfileContext';
import { useAsync } from '../../hooks/useAsync';
import { listMySessions } from '../../data/roundRepository';
import { pickActiveSession, todayInIceland } from '../../domain/activeSession';
import { ProfileSetup } from './ProfileSetup';
import { RoundCodeEntry } from './RoundCodeEntry';
import { ActiveEncounter } from './ActiveEncounter';
import { SyncIndicator } from '../../components/SyncIndicator';

/**
 * Leikskýrsla tab. Flow:
 *   no profile  -> select official player
 *   no round    -> six-digit round code
 *   joined      -> the match
 */
export function ScorecardPage() {
  const { t } = useTranslation();
  const { configured, userId, authError, ensurePlayerSession } = useAuth();
  const { playerId, syncing } = useProfile();

  if (!configured) {
    return (
      <>
        <PageHeader title={t('scorecard.title')} />
        <NotConfigured />
      </>
    );
  }
  if (authError) {
    return (
      <>
        <PageHeader title={t('scorecard.title')} />
        <ErrorState error={authError} onRetry={() => void ensurePlayerSession()} />
      </>
    );
  }
  if (!userId || syncing) {
    return (
      <>
        <PageHeader title={t('scorecard.title')} />
        <LoadingState />
      </>
    );
  }
  if (!playerId) return <ProfileSetup />;
  return <RoundGate userId={userId} />;
}

function RoundGate({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { player } = useProfile();
  const params = useParams();
  const matchNumber = params.matchNumber ? Number(params.matchNumber) : null;
  const sessions = useAsync(
    async () => pickActiveSession(await listMySessions(userId), todayInIceland()),
    [userId],
  );

  return (
    <>
      <PageHeader
        title={t('scorecard.title')}
        subtitle={player ? t('scorecard.playingAs', { name: player.fullName }) : undefined}
        actions={<SyncIndicator />}
      />
      <div className="page">
        <AsyncBoundary state={sessions}>
          {(active) =>
            active ? (
              <ActiveEncounter key={active.id} session={active} matchNumber={matchNumber} onLeft={sessions.reload} />
            ) : (
              <RoundCodeEntry onJoined={sessions.reload} />
            )
          }
        </AsyncBoundary>
      </div>
    </>
  );
}
