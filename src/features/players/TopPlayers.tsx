import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { List, ListRow } from '../../components/List';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { listGameScores, listPlayers } from '../../data/leagueRepository';
import { formatRankPosition, rankSinglesPlayers } from '../../domain/playerStats';
import { TOP_PLAYERS_LIMIT } from '../../config/app';
import type { LeagueData } from '../../hooks/useLeagueData';

/**
 * Secondary section under the league table: Topp 10 (singles only, officially confirmed
 * encounters – see rankSinglesPlayers) and a link to the full searchable player list.
 */
export function TopPlayers({ data }: { data: LeagueData }) {
  const { t } = useTranslation();
  const seasonId = data.league.season.id;
  const players = useAsync(() => listPlayers(seasonId), [seasonId]);
  // Game points for the point differential, reloaded only when an official result changes.
  const official = data.encounters.filter((e) => data.officialIds.has(e.id));
  const scoresKey = official.map((e) => `${e.id}:${e.resultHash}`).sort().join(',');
  const scores = useAsync(() => listGameScores(official.map((e) => e.id)), [scoresKey]);
  const byId = useMemo(() => new Map((players.data ?? []).map((p) => [p.id, p])), [players.data]);
  const top = useMemo(
    () =>
      rankSinglesPlayers(data.games, data.officialIds, (id) => byId.get(id)?.fullName ?? id, TOP_PLAYERS_LIMIT, scores.data ?? []),
    [data, byId, scores.data],
  );
  // Render once both the names and the game points are in (no reordering flash).
  const ready = {
    data: players.data !== undefined && scores.data !== undefined ? true : undefined,
    error: players.error ?? scores.error,
    loading: players.loading || scores.loading,
    reload: () => {
      players.reload();
      scores.reload();
    },
  };

  return (
    <section className="top-players" aria-labelledby="top-players-title">
      <div className="top-players__head">
        <h2 id="top-players-title" className="top-players__title">
          {t('players.title')}
        </h2>
        <p className="top-players__sub">{t('players.top')}</p>
      </div>
      <AsyncBoundary state={ready}>
        {() =>
          top.length === 0 ? (
            <EmptyState>{t('players.noResults')}</EmptyState>
          ) : (
            <ol className={`ranking${top.some((r) => r.tied) ? ' ranking--ranges' : ''}`} aria-describedby="top-players-note">
              <li className="ranking__header" aria-hidden>
                <span />
                <span />
                <span className="num">{t('players.colRecord')}</span>
              </li>
              {top.map((r) => {
                const p = byId.get(r.playerId);
                return (
                  <li key={r.playerId}>
                    <Link to={`/player/${r.playerId}`} className="ranking__row">
                      <span className="ranking__pos num">{formatRankPosition(r)}</span>
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
      <p id="top-players-note" className="note">
        {t('players.rankingNote')}
      </p>
      <List>
        <ListRow to="/players" title={t('players.viewAll')} chevron />
      </List>
    </section>
  );
}
