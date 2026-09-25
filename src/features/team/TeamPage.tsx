import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { EncounterRow } from '../../components/Encounter';
import { Stats } from '../../components/Stats';
import { ShareButton } from '../../components/ShareButton';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useLeagueData } from '../../hooks/useLeagueData';
import { getTeam, listTeamPlayers } from '../../data/leagueRepository';
import { isOfficial } from '../../domain/standings';

const RECENT_LIMIT = 5;

/** /team/:teamId – position, points, tiebreak detail, results, fixtures and roster. */
export function TeamPage() {
  const { t } = useTranslation();
  const { teamId = '' } = useParams();
  const league = useLeagueData();
  const seasonId = league.data?.league.season.id ?? null;
  const team = useAsync(async () => {
    const [info, roster] = await Promise.all([getTeam(teamId), seasonId ? listTeamPlayers(teamId, seasonId) : Promise.resolve([])]);
    return info ? { info, roster } : null;
  }, [teamId, seasonId]);

  return (
    <AsyncBoundary state={team}>
      {(tm) =>
        !tm ? (
          <>
            <PageHeader title={t('live.notFound')} back backTo="/standings" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader
              title={tm.info.name}
              subtitle={tm.info.club?.name}
              back
              backTo="/standings"
              actions={<ShareButton title={tm.info.name} />}
            />
            <div className="page">
              <AsyncBoundary state={league}>
                {(d) => {
                  if (!d) return null;
                  const row = d.standings.find((r) => r.teamId === teamId);
                  const mine = d.encounters.filter((e) => e.homeTeamId === teamId || e.awayTeamId === teamId);
                  const recent = mine
                    .filter(isOfficial)
                    .sort((a, b) => b.round.date.localeCompare(a.round.date) || b.round.number - a.round.number)
                    .slice(0, RECENT_LIMIT);
                  const upcoming = mine
                    .filter((e) => !isOfficial(e) && e.status !== 'cancelled')
                    .sort((a, b) => a.round.date.localeCompare(b.round.date) || a.round.number - b.round.number);
                  return (
                    <>
                      <p className="section__meta">
                        {d.league.division.name} · {d.league.season.name}
                      </p>
                      {row && (
                        <Stats
                          items={[
                            { label: t('team.position'), value: row.tied ? `${row.position} (${t('team.tied')})` : row.position },
                            { label: t('team.points'), value: row.points },
                          ]}
                        />
                      )}
                      {row && (
                        <Section title={t('team.encounters')}>
                          <Stats
                            items={[
                              { label: t('team.played'), value: row.played },
                              { label: t('team.wins'), value: row.won },
                              { label: t('team.draws'), value: row.drawn },
                              { label: t('team.losses'), value: row.lost },
                            ]}
                          />
                        </Section>
                      )}
                      {row && (
                        <Section title={t('team.ranking')}>
                          <Stats
                            items={[
                              { label: t('team.matches'), value: `${row.matchesWon}–${row.matchesLost}` },
                              { label: t('team.games'), value: `${row.gamesWon}–${row.gamesLost}` },
                            ]}
                          />
                          <p className="note">{t('team.rankingNote')}</p>
                        </Section>
                      )}
                      <Section title={t('team.recent')}>
                        {recent.length === 0 ? (
                          <p className="note">{t('team.noRecent')}</p>
                        ) : (
                          <ul className="list">
                            {recent.map((e) => (
                              <EncounterRow key={e.id} encounter={e} />
                            ))}
                          </ul>
                        )}
                      </Section>
                      <Section title={t('team.upcoming')}>
                        {upcoming.length === 0 ? (
                          <p className="note">{t('team.noUpcoming')}</p>
                        ) : (
                          <ul className="list">
                            {upcoming.map((e) => (
                              <EncounterRow key={e.id} encounter={e} showDate showStatus={e.status !== 'scheduled'} />
                            ))}
                          </ul>
                        )}
                      </Section>
                    </>
                  );
                }}
              </AsyncBoundary>
              <Section title={t('team.squad')}>
                <List>
                  {tm.roster.map((p) => (
                    <ListRow key={p.id} to={`/player/${p.id}`} title={p.fullName} chevron />
                  ))}
                </List>
              </Section>
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}
