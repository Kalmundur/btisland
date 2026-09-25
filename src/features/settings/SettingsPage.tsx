import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Info, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { SegmentedControl } from '../../components/Inputs';
import { Button } from '../../components/Button';
import { useProfile } from '../../state/ProfileContext';
import { isLanguage, setLanguage } from '../../i18n';
import { APP_NAME, APP_VERSION, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../../config/app';
import { ProfileSetup } from '../scorecard/ProfileSetup';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { player } = useProfile();
  const language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="page">
        <Section title={t('settings.language')}>
          <SegmentedControl
            label={t('settings.language')}
            value={language}
            options={SUPPORTED_LANGUAGES.map((l) => ({ value: l, label: t(`languages.${l}`) }))}
            onChange={setLanguage}
          />
        </Section>

        <Section title={t('settings.profile')}>
          <List>
            <ListRow
              to={player ? `/player/${player.id}` : undefined}
              leading={<UserRound size={20} aria-hidden />}
              title={player?.fullName ?? t('profile.notSet')}
              subtitle={player ? [player.clubName, player.teamName].filter(Boolean).join(' · ') : undefined}
              chevron={!!player}
            />
          </List>
          <Button variant="secondary" block onClick={() => navigate('/settings/profile')}>
            {player ? t('profile.change') : t('profile.setupTitle')}
          </Button>
        </Section>

        <Section title={t('settings.about')}>
          <List>
            <ListRow leading={<Info size={20} aria-hidden />} title={APP_NAME} subtitle={t('settings.version', { version: APP_VERSION })} />
            <ListRow to="/admin" leading={<ShieldCheck size={20} aria-hidden />} title={t('settings.adminPortal')} chevron />
          </List>
        </Section>
      </div>
    </>
  );
}

/** /settings/profile – "Skipta um prófíl". */
export function ChangeProfilePage() {
  const navigate = useNavigate();
  return <ProfileSetup back onDone={() => navigate('/settings', { replace: true })} />;
}
