import { Navigate, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { AsyncBoundary } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { getPlayerProfile } from '../../data/playerProfileRepository';
import { useProfile } from '../../state/ProfileContext';
import { PlayerProfileForm } from './PlayerProfileForm';
import { markProfileSetupDone } from './profileOnboarding';
import type { UUID } from '../../domain/types';

/** Optional step right after "Þetta er ég" (first time only). Saving or skipping continues. */
export function ProfileOnboarding({ playerId }: { playerId: UUID }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('playerProfile.title')} />
      <div className="page">
        <p className="lead">{t('playerProfile.intro')}</p>
        <PlayerProfileForm playerId={playerId} initial={null} mode="onboarding" onDone={() => markProfileSetupDone(playerId)} />
      </div>
    </>
  );
}

/** /settings/player-profile – edit the same three details later. */
export function PlayerProfileEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playerId } = useProfile();
  const profile = useAsync(() => (playerId ? getPlayerProfile(playerId) : Promise.resolve(null)), [playerId]);

  if (!playerId) return <Navigate to="/settings" replace />;
  return (
    <>
      <PageHeader title={t('playerProfile.editTitle')} back backTo="/settings" />
      <div className="page">
        <p className="lead">{t('playerProfile.intro')}</p>
        <AsyncBoundary state={profile}>
          {(initial) => (
            <PlayerProfileForm playerId={playerId} initial={initial} mode="edit" onDone={() => navigate('/settings', { replace: true })} />
          )}
        </AsyncBoundary>
      </div>
    </>
  );
}
