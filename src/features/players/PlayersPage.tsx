import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { SearchField } from '../../components/Inputs';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeague } from '../../state/LeagueContext';
import { useAsync } from '../../hooks/useAsync';
import { useLeagueData } from '../../hooks/useLeagueData';
import { listPlayers } from '../../data/leagueRepository';
import { rankSinglesPlayers } from '../../domain/playerStats';
import { matchesSearch } from '../../domain/search';
import { TOP_PLAYERS_LIMIT } from '../../config/app';

/** TOPP 10 (singles only, officially confirmed encounters) + searchable player list. */
export function PlayersPage() {
  const { t } = useTranslation();
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const leagueData = useLeagueData();
  const players = useAsync(() => listPlayers(seasonId), [seasonId]);
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map((players.data ?? []).map((p) => [p.id, p])), [players.data]);
  const top = useMemo(() => {
    if (!leagueData.data) return [];
    return rankSinglesPlayers(leagueData.data.games, leagueData.data.officialIds, (id) => byId.get(id)?.fullName ?? id, TOP_PLAYERS_LIMIT);
  }, [leagueData.data, byId]);
  const filtered = useMemo(
    () => (players.data ?? []).filter((p) => matchesSearch([p.fullName, p.clubName, p.teamName], query)),
    [players.data, query],
  );

  return (
    <>
      <PageHeader title={t('players.title')} subtitle={league.data?.division.name} />
      <div className="page">
        <Section title={t('players.top')}>
          <AsyncBoundary state={leagueData}>
            {() =>
              top.length === 0 ? (
                <EmptyState>{t('players.noResults')}</EmptyState>
              ) : (
                <ol className="ranking">
                  {top.map((r) => {
                    const p = byId.get(r.playerId);
                    return (
                      <li key={r.playerId}>
                        <Link to={`/player/${r.playerId}`} className="ranking__row">
                          <span className="ranking__pos num">{r.position}</span>
                          <span className="ranking__who">
                            <span className="ranking__name">{p?.fullName ?? '…'}</span>
                            <span className="ranking__team">{p?.teamName}</span>
                          </span>
                          <span className="ranking__record num">
                            {r.won}–{r.lost}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )
            }
          </AsyncBoundary>
          <p className="note">{t('players.rankingNote')}</p>
        </Section>

        <Section title={t('players.all')}>
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
        </Section>
      </div>
    </>
  );
}
