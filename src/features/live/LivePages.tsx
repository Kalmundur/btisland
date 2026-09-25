import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { List, ListRow, Section } from '../../components/List';
import { EncounterHeader, EncounterRow } from '../../components/Encounter';
import { LineupView } from '../../components/LineupView';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useLeague } from '../../state/LeagueContext';
import { useAsync } from '../../hooks/useAsync';
import { useEncounterData } from '../../hooks/useEncounterData';
import {
  getPlayer,
  getRound,
  getTeam,
  listDivisionEncounters,
  listRoundEncounters,
  listRounds,
  listTeamEncounters,
  listTeamPlayers,
} from '../../data/leagueRepository';
import { formatDate, formatTime } from '../../lib/format';
import type { EncounterDetail, Round } from '../../domain/types';

function roundTitle(t: (k: string, o?: Record<string, unknown>) => string, r: Round) {
  return `${t('round.label', { number: r.number })} · ${formatDate(r.date)}`;
}

/** /live – full schedule of the current division, grouped by round. */
export function LivePage() {
  const { t } = useTranslation();
  const league = useLeague();
  const divisionId = league.data?.division.id ?? null;
  const data = useAsync(async () => {
    if (!divisionId) return { rounds: [] as Round[], encounters: [] as EncounterDetail[] };
    const [rounds, encounters] = await Promise.all([listRounds(divisionId), listDivisionEncounters(divisionId)]);
    return { rounds, encounters };
  }, [divisionId]);

  return (
    <>
      <PageHeader
        title={t('live.title')}
        subtitle={league.data ? `${league.data.division.name} · ${league.data.season.name}` : undefined}
        back
        backTo="/standings"
      />
      <div className="page">
        <AsyncBoundary state={data}>
          {({ rounds, encounters }) =>
            rounds.length === 0 ? (
              <EmptyState>{t('live.noRounds')}</EmptyState>
            ) : (
              rounds.map((r) => (
                <Section
                  key={r.id}
                  title={
                    <Link to={`/live/round/${r.id}`} className="section__link">
                      {roundTitle(t, r)}
                    </Link>
                  }
                >
                  {r.venue && <p className="section__meta">{r.venue}</p>}
                  <ul className="list">
                    {encounters
                      .filter((e) => e.roundId === r.id)
                      .map((e) => (
                        <EncounterRow key={e.id} encounter={e} />
                      ))}
                  </ul>
                </Section>
              ))
            )
          }
        </AsyncBoundary>
      </div>
    </>
  );
}

/** /live/round/:roundId */
export function RoundPage() {
  const { t } = useTranslation();
  const { roundId = '' } = useParams();
  const data = useAsync(async () => {
    const [round, encounters] = await Promise.all([getRound(roundId), listRoundEncounters(roundId)]);
    return { round, encounters };
  }, [roundId]);

  return (
    <AsyncBoundary state={data}>
      {({ round, encounters }) =>
        !round ? (
          <>
            <PageHeader title={t('live.title')} back backTo="/live" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader title={t('round.label', { number: round.number })} subtitle={formatDate(round.date)} back backTo="/live" />
            <div className="page">
              <p className="section__meta">
                {formatTime(round.startTime) ?? t('common.tba')}
                {round.venue ? ` · ${round.venue}` : ''}
              </p>
              {encounters.length === 0 ? (
                <EmptyState>{t('live.noEncounters')}</EmptyState>
              ) : (
                <ul className="list">
                  {encounters.map((e) => (
                    <EncounterRow key={e.id} encounter={e} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}

/** /live/match/:encounterId – public match view (revealed lineups, decided games). */
export function MatchPage() {
  const { t } = useTranslation();
  const { encounterId = '' } = useParams();
  const data = useEncounterData(encounterId);

  return (
    <>
      <PageHeader title={t('live.matchTitle')} back backTo="/live" />
      <div className="page">
        <AsyncBoundary state={data}>
          {({ encounter, lineups, games, names }) =>
            !encounter ? (
              <EmptyState>{t('live.notFound')}</EmptyState>
            ) : (
              <>
                <EncounterHeader encounter={encounter} />
                <Section title={t('scorecard.lineupTitle')}>
                  <LineupView encounter={encounter} lineups={lineups} names={names} />
                </Section>
                <Section title={t('live.games')}>
                  {games.length === 0 ? (
                    <p className="note">{t('live.noGames')}</p>
                  ) : (
                    <ul className="list">
                      {games.map((g) => (
                        <li key={g.id} className="game-row">
                          <span className="game-row__no num">{g.gameNumber}</span>
                          <span className="game-row__players">
                            {g.kind === 'doubles' && <span className="game-row__kind">{t('live.doubles')}</span>}
                            {g.homePlayerIds.map((id) => names[id]).join(' / ') || t('common.none')}
                            <span className="muted"> – </span>
                            {g.awayPlayerIds.map((id) => names[id]).join(' / ') || t('common.none')}
                          </span>
                          <span className="game-row__score num">
                            {g.homeSets}–{g.awaySets}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )
          }
        </AsyncBoundary>
      </div>
    </>
  );
}

/** /team/:teamId */
export function TeamPage() {
  const { t } = useTranslation();
  const { teamId = '' } = useParams();
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const data = useAsync(async () => {
    const [team, encounters, players] = await Promise.all([
      getTeam(teamId),
      listTeamEncounters(teamId),
      seasonId ? listTeamPlayers(teamId, seasonId) : Promise.resolve([]),
    ]);
    return { team, encounters, players };
  }, [teamId, seasonId]);

  return (
    <AsyncBoundary state={data}>
      {({ team, encounters, players }) =>
        !team ? (
          <>
            <PageHeader title={t('live.notFound')} back backTo="/standings" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader title={team.name} subtitle={team.club?.name} back backTo="/standings" />
            <div className="page">
              <Section title={t('team.squad')}>
                <List>
                  {players.map((p) => (
                    <ListRow key={p.id} to={`/player/${p.id}`} title={p.fullName} chevron />
                  ))}
                </List>
              </Section>
              <Section title={t('team.fixtures')}>
                <ul className="list">
                  {encounters.map((e) => (
                    <EncounterRow key={e.id} encounter={e} showDate />
                  ))}
                </ul>
              </Section>
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}

/** /player/:playerId */
export function PlayerPage() {
  const { t } = useTranslation();
  const { playerId = '' } = useParams();
  const league = useLeague();
  const seasonId = league.data?.season.id ?? null;
  const data = useAsync(() => getPlayer(playerId, seasonId), [playerId, seasonId]);

  return (
    <AsyncBoundary state={data}>
      {(player) =>
        !player ? (
          <>
            <PageHeader title={t('live.notFound')} back backTo="/players" />
            <EmptyState>{t('live.notFound')}</EmptyState>
          </>
        ) : (
          <>
            <PageHeader title={player.fullName} back backTo="/players" />
            <div className="page">
              <List>
                {player.teamId && (
                  <ListRow to={`/team/${player.teamId}`} title={player.teamName} subtitle={t('player.team')} chevron />
                )}
                <ListRow title={player.clubName} subtitle={t('player.club')} />
              </List>
            </div>
          </>
        )
      }
    </AsyncBoundary>
  );
}
