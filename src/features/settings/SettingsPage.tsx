import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Info, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { SegmentedControl } from '../../components/Inputs';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useProfile } from '../../state/ProfileContext';
import { useErrorText } from '../../hooks/useErrorText';
import { isLanguage, setLanguage } from '../../i18n';
import { APP_NAME, APP_VERSION, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../../config/app';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { player, playerId, logout } = useProfile();
  const errorText = useErrorText();
  const [confirmLogout, setConfirmLogout] = useState(false);
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
          {/* Which player this device is using – informational, no destination. Its one action sits
              inside the row, under the name, so both states share the same layout. */}
          <List>
            <li>
              <div className="list-row profile-row">
                <span className="list-row__leading">
                  <UserRound size={20} aria-hidden />
                </span>
                <div className="list-row__main">
                  <span className="list-row__title">{player?.fullName ?? (playerId ? '…' : t('profile.notSet'))}</span>
                  {player && (
                    <span className="list-row__subtitle">{[player.clubName, player.teamName].filter(Boolean).join(' · ')}</span>
                  )}
                  {playerId ? (
                    <Button variant="secondary" className="settings-action" icon={<LogOut size={16} aria-hidden />} onClick={() => setConfirmLogout(true)}>
                      {t('profile.logout')}
                    </Button>
                  ) : (
                    <Button variant="secondary" className="settings-action" onClick={() => navigate('/scorecard')}>
                      {t('profile.setupTitle')}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          </List>
        </Section>

        <Section title={t('settings.about')}>
          <List>
            <ListRow leading={<Info size={20} aria-hidden />} title={APP_NAME} subtitle={t('settings.version', { version: APP_VERSION })} />
            {/* Visible to everyone: /admin shows the organizer login unless an organizer is signed in. */}
            <ListRow to="/admin" leading={<ShieldCheck size={20} aria-hidden />} title={t('settings.adminPortal')} chevron />
          </List>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title={t('profile.logoutTitle')}
        body={t('profile.logoutBody')}
        confirmLabel={t('profile.logout')}
        destructive
        onClose={() => setConfirmLogout(false)}
        errorText={(e) => (e instanceof Error && e.message === 'unsynced_scores' ? t('profile.logoutUnsynced') : errorText(e))}
        onConfirm={async () => {
          await logout();
          setConfirmLogout(false);
          navigate('/scorecard', { replace: true });
        }}
      />
    </>
  );
}
