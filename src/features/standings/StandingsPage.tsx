import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow } from '../../components/List';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeague } from '../../state/LeagueContext';
import { useAsync } from '../../hooks/useAsync';
import { listDivisionEncounters, listDivisionTeams } from '../../data/leagueRepository';
import { computeStandings } from '../../domain/standings';
import type { LeagueContext } from '../../domain/types';

export function StandingsPage() {
  const { t } = useTranslation();
  const league = useLeague();

  return (
    <AsyncBoundary state={league}>
      {(ctx) =>
        ctx ? (
          <StandingsTable league={ctx} />
        ) : (
          <>
            <PageHeader title={t('standings.title')} />
            <EmptyState>{t('standings.noSeason')}</EmptyState>
          </>
        )
      }
    </AsyncBoundary>
  );
}

function StandingsTable({ league }: { league: LeagueContext }) {
  const { t } = useTranslation();
  const divisionId = league.division.id;
  const rows = useAsync(async () => {
    const [teams, encounters] = await Promise.all([
      listDivisionTeams(divisionId),
      listDivisionEncounters(divisionId),
    ]);
    return computeStandings(teams, encounters);
  }, [divisionId]);

  return (
    <>
      <PageHeader title={league.division.name} subtitle={league.season.name} />
      <div className="page page--flush">
        <AsyncBoundary state={rows}>
          {(standings) => (
            <table className="table standings">
              <thead>
                <tr>
                  <th className="table__num" scope="col">{t('standings.colPosition')}</th>
                  <th scope="col">{t('standings.colTeam')}</th>
                  <th className="table__num" scope="col">{t('standings.colPlayed')}</th>
                  <th className="table__num" scope="col">{t('standings.colPoints')}</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r) => (
                  <tr key={r.teamId}>
                    <td className="table__num muted num">{r.position}</td>
                    <td>
                      <Link to={`/team/${r.teamId}`} className="table__link table__link--block">
                        {r.teamName}
                      </Link>
                    </td>
                    <td className="table__num num">{r.played}</td>
                    <td className="table__num num standings__points">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AsyncBoundary>
        <p className="note note--inset">{t('standings.legend')}</p>
        <List>
          <ListRow to="/live" leading={<CalendarDays size={20} aria-hidden />} title={t('standings.schedule')} chevron />
        </List>
      </div>
    </>
  );
}
