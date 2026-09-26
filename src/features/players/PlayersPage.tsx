import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow } from '../../components/List';
import { SearchField } from '../../components/Inputs';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeague } from '../../state/LeagueContext';
import { useAsync } from '../../hooks/useAsync';
import { listPlayers } from '../../data/leagueRepository';
import { matchesSearch } from '../../domain/search';

/** /players – the full searchable player list ("Sjá alla leikmenn" under Staða). */
export function PlayersPage() {
  const { t } = useTranslation();
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const players = useAsync(() => listPlayers(seasonId), [seasonId]);
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => (players.data ?? []).filter((p) => matchesSearch([p.fullName, p.clubName, p.teamName], query)),
    [players.data, query],
  );

  return (
    <>
      <PageHeader title={t('players.title')} subtitle={league.data?.division.name} back backTo="/standings" />
      <div className="page">
        <SearchField value={query} onChange={setQuery} placeholder={t('players.searchPlaceholder')} />
        <AsyncBoundary state={players}>
          {() =>
            filtered.length === 0 ? (
              <EmptyState>{t('profile.noResults')}</EmptyState>
            ) : (
              <List>
                {filtered.map((p) => (
                  <ListRow
                    key={p.id}
                    to={`/player/${p.id}`}
                    title={p.fullName}
                    subtitle={[p.teamName, p.clubName].filter(Boolean).join(' · ')}
                    chevron
                  />
                ))}
              </List>
            )
          }
        </AsyncBoundary>
      </div>
    </>
  );
}
