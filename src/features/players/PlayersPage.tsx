import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { SearchField } from '../../components/Inputs';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeague } from '../../state/LeagueContext';
import { useAsync } from '../../hooks/useAsync';
import { listDecidedGames, listDivisionEncounters, listPlayers } from '../../data/leagueRepository';
import { rankPlayers } from '../../domain/playerRanking';
import { matchesSearch } from '../../domain/search';
import { TOP_PLAYERS_LIMIT } from '../../config/app';

export function PlayersPage() {
  const { t } = useTranslation();
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const divisionId = league.data?.division.id ?? null;
  const [query, setQuery] = useState('');

  const players = useAsync(() => listPlayers(seasonId), [seasonId]);
  const top = useAsync(async () => {
    if (!divisionId) return [];
    const encounters = await listDivisionEncounters(divisionId);
    const games = await listDecidedGames(encounters.map((e) => e.id));
    return rankPlayers(games, TOP_PLAYERS_LIMIT);
  }, [divisionId]);

  const names = useMemo(
    () => Object.fromEntries((players.data ?? []).map((p) => [p.id, p])),
    [players.data],
  );
  const filtered = useMemo(
    () => (players.data ?? []).filter((p) => matchesSearch([p.fullName, p.clubName, p.teamName], query)),
    [players.data, query],
  );

  return (
    <>
      <PageHeader title={t('players.title')} subtitle={league.data?.division.name} />
      <div className="page">
        <Section title={t('players.top')}>
          <AsyncBoundary state={top}>
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState>{t('players.noResults')}</EmptyState>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th className="table__num" scope="col">#</th>
                      <th scope="col">{t('players.colPlayer')}</th>
                      <th className="table__num" scope="col">{t('players.colRecord')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.playerId}>
                        <td className="table__num muted num">{r.position}</td>
                        <td>
                          <Link to={`/player/${r.playerId}`} className="table__link">
                            {names[r.playerId]?.fullName ?? '…'}
                          </Link>
                          <span className="table__sub">{names[r.playerId]?.teamName}</span>
                        </td>
                        <td className="table__num num">
                          {r.won}–{r.lost}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </AsyncBoundary>
        </Section>

        <Section title={t('players.all')}>
          <SearchField value={query} onChange={setQuery} placeholder={t('players.searchPlaceholder')} />
          <AsyncBoundary state={players}>
            {() => (
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
            )}
          </AsyncBoundary>
        </Section>
      </div>
    </>
  );
}
