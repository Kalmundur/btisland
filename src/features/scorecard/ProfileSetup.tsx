import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow } from '../../components/List';
import { SearchField } from '../../components/Inputs';
import { Button } from '../../components/Button';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { listPlayers } from '../../data/leagueRepository';
import { matchesSearch } from '../../domain/search';
import { useLeague } from '../../state/LeagueContext';
import { useProfile } from '../../state/ProfileContext';
import type { PlayerListItem } from '../../domain/types';
import { needsProfileSetup, pendingProfileSetup } from '../profile/profileOnboarding';

/**
 * "Setja upp prófíl": pick yourself from the official player register.
 * No free-text names – only existing Player records can be selected.
 */
export function ProfileSetup() {
  const { t } = useTranslation();
  const league = useLeague();
  const { playerId, selectPlayer } = useProfile();
  const seasonId = league.data?.season.id ?? null;
  const players = useAsync(() => listPlayers(seasonId), [seasonId]);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PlayerListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const filtered = useMemo(
    () => (players.data ?? []).filter((p) => matchesSearch([p.fullName, p.clubName, p.teamName], query)),
    [players.data, query],
  );

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError(false);
    try {
      // The optional profile step is decided first, so the next screen appears straight away.
      if (await needsProfileSetup(selected.id)) pendingProfileSetup.set(selected.id);
      await selectPlayer(selected.id);
    } catch {
      pendingProfileSetup.set(null);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t('profile.setupTitle')} />
      <div className="page">
        <p className="lead">{t('profile.setupIntro')}</p>
        <SearchField value={query} onChange={setQuery} placeholder={t('profile.searchPlaceholder')} />
        <AsyncBoundary state={players}>
          {() =>
            filtered.length === 0 ? (
              <EmptyState>{t('profile.noResults')}</EmptyState>
            ) : (
              <List>
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  return (
                    <ListRow
                      key={p.id}
                      onClick={() => setSelected(p)}
                      selected={isSelected}
                      title={p.fullName}
                      subtitle={[p.clubName, p.teamName].filter(Boolean).join(' · ')}
                      trailing={
                        isSelected || (!selected && p.id === playerId) ? (
                          <Check size={20} className="accent" aria-hidden />
                        ) : undefined
                      }
                    />
                  );
                })}
              </List>
            )
          }
        </AsyncBoundary>
        <p className="note">{t('profile.trustNote')}</p>
      </div>

      {selected && (
        <div className="action-bar">
          <div className="action-bar__inner">
            <span className="action-bar__text">{t('profile.selected', { name: selected.fullName })}</span>
            {error && <span className="form-error">{t('profile.saveError')}</span>}
            <Button block onClick={confirm} disabled={saving}>
              {saving ? t('common.saving') : t('profile.thisIsMe')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
