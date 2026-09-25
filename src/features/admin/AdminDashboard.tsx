import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, PlayCircle } from 'lucide-react';
import { EncounterRow } from '../../components/Encounter';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useLeagueData, type LeagueData } from '../../hooks/useLeagueData';
import { listConflictCounts } from '../../data/leagueRepository';
import { deriveRoundStatus, liveOverview } from '../../domain/rounds';
import { todayInIceland } from '../../domain/activeSession';
import { formatDate } from '../../lib/format';
import type { Round } from '../../domain/types';
import { AdminCard } from './adminUi';

/** "What needs attention?" – live counts and the current round, updated in realtime. */
export function AdminDashboard() {
  const { t } = useTranslation();
  const league = useLeagueData();

  return (
    <div className="admin-page">
      <div className="admin-page__head">
        <div>
          <h1 className="admin-page__title">{t('admin.nav.dashboard')}</h1>
          {league.data && (
            <p className="muted">
              {league.data.league.division.name} · {league.data.league.season.name}
            </p>
          )}
        </div>
      </div>
      <AsyncBoundary state={league}>{(d) => (d ? <Attention data={d} /> : <EmptyState>{t('standings.noSeason')}</EmptyState>)}</AsyncBoundary>
    </div>
  );
}

/** The round to focus on: one with live encounters, else the next one, else the latest. */
function currentRound(data: LeagueData): Round | null {
  const inRound = (r: Round) => data.encounters.filter((e) => e.roundId === r.id);
  const live = data.rounds.find((r) => deriveRoundStatus(inRound(r)) === 'in_progress');
  if (live) return live;
  const overview = liveOverview(data.rounds, data.encounters, todayInIceland(), 1);
  return overview.upcoming ?? overview.recent[0] ?? data.rounds[0] ?? null;
}

function Attention({ data }: { data: LeagueData }) {
  const { t } = useTranslation();
  const conflicts = useAsync(() => listConflictCounts(data.encounters.map((e) => e.id)), [data]);
  const counts = conflicts.data ?? {};
  const inProgress = data.encounters.filter((e) => e.status === 'lineups' || e.status === 'in_progress').length;
  const awaiting = data.encounters.filter((e) => e.status === 'awaiting_confirmation').length;
  const conflictTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const round = currentRound(data);
  const roundEncounters = round ? data.encounters.filter((e) => e.roundId === round.id) : [];
  const flagged = data.encounters.filter((e) => (counts[e.id] ?? 0) > 0 && e.roundId !== round?.id);

  const tile = (icon: ReactNode, value: number, label: string, tone: string) => (
    <div className={`stat stat--${value > 0 ? tone : 'idle'}`}>
      {icon}
      <span className="stat__value num">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );

  return (
    <>
      <div className="stat-grid">
        {tile(<PlayCircle size={18} className="stat__icon" aria-hidden />, inProgress, t('admin.dashboard.inProgress'), 'accent')}
        {tile(<Clock size={18} className="stat__icon" aria-hidden />, awaiting, t('admin.dashboard.awaiting'), 'warning')}
        {tile(<AlertTriangle size={18} className="stat__icon" aria-hidden />, conflictTotal, t('admin.dashboard.conflicts'), 'danger')}
      </div>

      {round ? (
        <AdminCard
          title={`${t('admin.dashboard.currentRound')} · ${t('round.label', { number: round.number })}`}
          actions={<Link to={`/admin/rounds/${round.id}`}>{t('admin.match.open')}</Link>}
        >
          <p className="muted">
            {formatDate(round.date)}
            {round.venue ? ` · ${round.venue}` : ''}
          </p>
          <ul className="list">
            {roundEncounters.map((e) => (
              <EncounterRow key={e.id} encounter={e} showStatus conflicts={counts[e.id] ?? 0} to={`/admin/encounters/${e.id}`} />
            ))}
          </ul>
        </AdminCard>
      ) : (
        <p className="muted">{t('admin.dashboard.noRound')}</p>
      )}

      {flagged.length > 0 && (
        <AdminCard title={t('admin.dashboard.otherConflicts')}>
          <ul className="list">
            {flagged.map((e) => (
              <EncounterRow key={e.id} encounter={e} showStatus conflicts={counts[e.id]} to={`/admin/encounters/${e.id}`} />
            ))}
          </ul>
        </AdminCard>
      )}
    </>
  );
}
