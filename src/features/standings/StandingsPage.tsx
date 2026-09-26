import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow } from '../../components/List';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeagueData, type LeagueData } from '../../hooks/useLeagueData';

/**
 * Compact table: # | Lið | L | S-J-T | Stig. Tiebreak details live on the team page.
 * Officially tied teams share a position; before any official result every rank is "–".
 */
export function StandingsPage() {
  const { t } = useTranslation();
  const data = useLeagueData();

  return (
    <AsyncBoundary state={data}>
      {(d) =>
        !d ? (
          <>
            <PageHeader title={t('standings.title')} />
            <EmptyState>{t('standings.noSeason')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader title={d.league.division.name} subtitle={d.league.season.name} />
            <div className="page page--flush">
              <StandingsTable data={d} />
              {d.standings.every((r) => r.played === 0) && <p className="note note--inset">{t('standings.noResultsYet')}</p>}
              <p className="note note--inset standings__legend">{t('standings.legend')}</p>
              <List>
                <ListRow to="/live" leading={<CalendarDays size={20} aria-hidden />} title={t('standings.schedule')} chevron />
              </List>
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}

function StandingsTable({ data }: { data: LeagueData }) {
  const { t } = useTranslation();
  // No officially confirmed encounter yet: every team would be "1", which says nothing.
  const ranked = data.officialIds.size > 0;

  return (
    <table className="table standings">
      <thead>
        <tr>
          <th className="table__num" scope="col">{t('standings.colPosition')}</th>
          <th scope="col">{t('standings.colTeam')}</th>
          <th className="table__num" scope="col">{t('standings.colPlayed')}</th>
          <th className="table__num" scope="col">{t('standings.colRecord')}</th>
          <th className="table__num" scope="col">{t('standings.colPoints')}</th>
        </tr>
      </thead>
      <tbody>
        {data.standings.map((r) => (
          <tr key={r.teamId}>
            <td className="table__num muted num">{ranked ? r.position : '–'}</td>
            <td>
              <Link to={`/team/${r.teamId}`} className="table__link table__link--block">
                {r.teamName}
              </Link>
            </td>
            <td className="table__num num">{r.played}</td>
            <td className="table__num num">
              {r.won}-{r.drawn}-{r.lost}
            </td>
            <td className="table__num num standings__points">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
