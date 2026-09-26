import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { Stats } from '../../components/Stats';
import { ShareButton } from '../../components/ShareButton';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeague } from '../../state/LeagueContext';
import { useAsync } from '../../hooks/useAsync';
import { getPlayer, getPlayerNames, listPlayerGames } from '../../data/leagueRepository';
import { playerSummary, type PlayerMatchLine } from '../../domain/playerStats';
import { formatShortDate } from '../../lib/format';

/** /player/:playerId – singles record (Top 5 basis) and a separate doubles section. */
export function PlayerPage() {
  const { t } = useTranslation();
  const { playerId = '' } = useParams();
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const data = useAsync(async () => {
    const [player, games] = await Promise.all([getPlayer(playerId, seasonId), listPlayerGames(playerId)]);
    if (!player) return null;
    const summary = playerSummary(playerId, games);
    const others = [...summary.recentSingles, ...summary.recentDoubles].flatMap((l) => [...l.opponentIds, ...l.partnerIds]);
    return { player, summary, names: await getPlayerNames(others) };
  }, [playerId, seasonId]);

  return (
    <AsyncBoundary state={data}>
      {(d) =>
        !d ? (
          <>
            <PageHeader title={t('live.notFound')} back backTo="/standings" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader
              title={d.player.fullName}
              subtitle={[d.player.teamName, d.player.clubName].filter(Boolean).join(' · ')}
              back
              backTo="/standings"
              actions={<ShareButton title={d.player.fullName} />}
            />
            <div className="page">
              <List>
                {d.player.teamId && (
                  <ListRow to={`/team/${d.player.teamId}`} title={d.player.teamName} subtitle={t('player.team')} chevron />
                )}
                <ListRow title={d.player.clubName} subtitle={t('player.club')} />
              </List>

              <Section title={t('player.singles')}>
                <Stats
                  items={[
                    { label: t('player.winsLosses'), value: `${d.summary.singles.won}–${d.summary.singles.lost}` },
                    { label: t('player.played'), value: d.summary.singles.played },
                    { label: t('player.games'), value: `${d.summary.singles.gamesWon}–${d.summary.singles.gamesLost}` },
                    {
                      label: t('player.winPct'),
                      value: d.summary.singles.winPct === null ? t('common.none') : `${d.summary.singles.winPct}%`,
                      secondary: true,
                    },
                  ]}
                />
              </Section>

              <Section title={t('player.recentSingles')}>
                {d.summary.recentSingles.length === 0 ? (
                  <p className="note">{t('player.noMatches')}</p>
                ) : (
                  <MatchLines lines={d.summary.recentSingles} names={d.names} />
                )}
              </Section>

              <Section title={t('player.doubles')}>
                <Stats
                  items={[
                    { label: t('player.winsLosses'), value: `${d.summary.doubles.won}–${d.summary.doubles.lost}` },
                    { label: t('player.played'), value: d.summary.doubles.played },
                  ]}
                />
                {d.summary.recentDoubles.length > 0 && <MatchLines lines={d.summary.recentDoubles} names={d.names} doubles />}
                <p className="note">{t('player.doublesNote')}</p>
              </Section>
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}

function MatchLines({ lines, names, doubles }: { lines: PlayerMatchLine[]; names: Record<string, string>; doubles?: boolean }) {
  const { t } = useTranslation();
  const who = (ids: string[]) => ids.map((id) => names[id] ?? '…').join(' / ');
  return (
    <ul className="list">
      {lines.map((l) => (
        <li key={`${l.encounterId}-${l.matchNumber}`}>
          <Link to={`/live/match/${l.encounterId}`} className="result-line">
            <span className={`result-line__mark${l.won ? ' result-line__mark--won' : ''}`}>{l.won ? t('player.won') : t('player.lost')}</span>
            <span className="result-line__main">
              <span className="result-line__who">
                {doubles && l.partnerIds.length > 0 && <span className="muted">{t('player.with', { name: who(l.partnerIds) })} · </span>}
                {t('player.vs', { name: who(l.opponentIds) })}
              </span>
              <span className="result-line__meta">
                {l.opponentTeam} · {t('round.short', { number: l.roundNumber })} · {formatShortDate(l.date)}
              </span>
            </span>
            <span className="result-line__score num">
              {l.gamesFor}–{l.gamesAgainst}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
