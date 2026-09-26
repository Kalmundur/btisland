/** Organizer detail pages for clubs, teams, players and divisions. */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { EncounterRow } from '../../components/Encounter';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { deleteRow, insertRow, listRows, listRowsWhere, updateRow, type AdminRow } from '../../data/adminRepository';
import { listTeamEncounters } from '../../data/leagueRepository';
import { isUuid } from '../../lib/ids';
import { formatDate } from '../../lib/format';
import { AdminBack, AdminCard, AdminError, AdminSelect, str, useAdminAction } from './adminUi';

const byName = (key: string) => (a: AdminRow, b: AdminRow) => str(a[key]).localeCompare(str(b[key]), 'is');
const activeLabel = (t: (k: string) => string, row: AdminRow) => (row.is_active === false ? t('admin.detail.inactive') : null);

// ---------------------------------------------------------------------------------------------
// Club: its teams and players
// ---------------------------------------------------------------------------------------------
export function ClubDetailPage() {
  const { t } = useTranslation();
  const { clubId = '' } = useParams();
  const data = useAsync(async () => {
    if (!isUuid(clubId)) return null;
    const [clubs, teams, players] = await Promise.all([
      listRowsWhere('clubs', { id: clubId }),
      listRowsWhere('teams', { club_id: clubId }),
      listRowsWhere('players', { club_id: clubId }),
    ]);
    return clubs[0] ? { club: clubs[0], teams: teams.sort(byName('name')), players: players.sort(byName('full_name')) } : null;
  }, [clubId]);

  return (
    <div className="admin-page">
      <AdminBack to="/admin/clubs" label={t('admin.nav.clubs')} />
      <AsyncBoundary state={data}>
        {(d) =>
          !d ? (
            <EmptyState>{t('live.notFound')}</EmptyState>
          ) : (
            <>
              <div className="admin-page__head">
                <div>
                  <h1 className="admin-page__title">{str(d.club.name)}</h1>
                  <p className="muted">
                    {[str(d.club.short_name), activeLabel(t, d.club)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <AdminCard title={t('admin.detail.teams')}>
                <LinkList rows={d.teams} label={(r) => str(r.name)} to={(r) => `/admin/teams/${str(r.id)}`} extra={(r) => activeLabel(t, r)} />
              </AdminCard>
              <AdminCard title={t('admin.detail.players')}>
                <LinkList rows={d.players} label={(r) => str(r.full_name)} to={(r) => `/admin/players/${str(r.id)}`} extra={(r) => activeLabel(t, r)} />
              </AdminCard>
            </>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

function LinkList({
  rows,
  label,
  to,
  extra,
}: {
  rows: AdminRow[];
  label: (r: AdminRow) => string;
  to: (r: AdminRow) => string;
  extra?: (r: AdminRow) => string | null;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return <p className="muted">{t('admin.detail.noItems')}</p>;
  return (
    <ul className="list">
      {rows.map((r) => (
        <li key={str(r.id)}>
          <Link to={to(r)} className="admin-link-row">
            <span>{label(r)}</span>
            {extra?.(r) && <span className="muted">{extra(r)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// Team: divisions entered, roster per season/division, results
// ---------------------------------------------------------------------------------------------
export function TeamDetailPage() {
  const { t } = useTranslation();
  const { teamId = '' } = useParams();
  const data = useAsync(async () => {
    if (!isUuid(teamId)) return null;
    const [teams, entries, regs, divisions, seasons, players, encounters] = await Promise.all([
      listRowsWhere('teams', { id: teamId }),
      listRowsWhere('division_teams', { team_id: teamId }),
      listRowsWhere('team_registrations', { team_id: teamId }),
      listRows('divisions', [{ column: 'sort_order' }]),
      listRows('seasons', [{ column: 'name', ascending: false }]),
      listRows('players', [{ column: 'full_name' }]),
      listTeamEncounters(teamId),
    ]);
    if (!teams[0]) return null;
    const clubs = await listRowsWhere('clubs', { id: str(teams[0].club_id) });
    return { team: teams[0], club: clubs[0] ?? null, entries, regs, divisions, seasons, players, encounters };
  }, [teamId]);
  const [addDivision, setAddDivision] = useState('');
  const action = useAdminAction(data.reload);

  return (
    <div className="admin-page">
      <AdminBack to="/admin/teams" label={t('admin.nav.teams')} />
      <AsyncBoundary state={data}>
        {(d) => {
          if (!d) return <EmptyState>{t('live.notFound')}</EmptyState>;
          const seasonName = (id: unknown) => str(d.seasons.find((s) => s.id === id)?.name);
          const divisionLabel = (id: unknown) => {
            const div = d.divisions.find((x) => x.id === id);
            return div ? `${str(div.name)} · ${seasonName(div.season_id)}` : '';
          };
          const playerName = (id: unknown) => str(d.players.find((p) => p.id === id)?.full_name);
          // One division per season: only seasons the team is not in yet can be added.
          const seasonsEntered = new Set(d.entries.map((e) => str(e.season_id)));
          const addable = d.divisions.filter((x) => !seasonsEntered.has(str(x.season_id)));
          const hasEncounters = (divisionId: unknown) => d.encounters.some((enc) => enc.round.divisionId === divisionId);
          return (
            <>
              <div className="admin-page__head">
                <div>
                  <h1 className="admin-page__title">{str(d.team.name)}</h1>
                  <p className="muted">
                    {d.club && <Link to={`/admin/clubs/${str(d.club.id)}`}>{str(d.club.name)}</Link>}
                    {activeLabel(t, d.team) && ` · ${activeLabel(t, d.team)}`}
                  </p>
                </div>
              </div>

              <AdminCard title={t('admin.detail.divisions')}>
                {d.entries.length === 0 ? (
                  <p className="muted">{t('admin.detail.noItems')}</p>
                ) : (
                  <ul className="list">
                    {d.entries.map((e) => (
                      <li key={str(e.division_id)} className="admin-link-row">
                        <Link to={`/admin/divisions/${str(e.division_id)}`}>{divisionLabel(e.division_id)}</Link>
                        {/* Removable only until the team has encounters in it (enforced in the database too). */}
                        {!hasEncounters(e.division_id) && (
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            aria-label={t('admin.detail.remove')}
                            disabled={action.busy}
                            onClick={() => window.confirm(t('admin.crud.confirmDelete')) && void action.run(() => deleteRow('division_teams', { division_id: e.division_id, team_id: teamId }))}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {addable.length > 0 && (
                  <div className="inline-form">
                    <AdminSelect
                      label={t('admin.detail.addDivision')}
                      value={addDivision}
                      onChange={setAddDivision}
                      options={addable.map((x) => ({ value: str(x.id), label: divisionLabel(x.id) }))}
                    />
                    <Button
                      size="sm"
                      icon={<Plus size={16} aria-hidden />}
                      disabled={!addDivision || action.busy}
                      onClick={() => void action.run(() => insertRow('division_teams', { division_id: addDivision, team_id: teamId })).then(() => setAddDivision(''))}
                    >
                      {t('admin.crud.add')}
                    </Button>
                  </div>
                )}
                <AdminError error={action.error} />
              </AdminCard>

              <AdminCard title={t('admin.detail.roster')}>
                {d.regs.length === 0 ? (
                  <p className="muted">{t('admin.detail.noItems')}</p>
                ) : (
                  <ul className="list">
                    {[...d.regs]
                      .sort((a, b) => playerName(a.player_id).localeCompare(playerName(b.player_id), 'is'))
                      .map((r) => (
                        <li key={str(r.id)} className="admin-link-row">
                          <Link to={`/admin/players/${str(r.player_id)}`}>{playerName(r.player_id)}</Link>
                          <span className="muted">
                            {divisionLabel(r.division_id)}
                            {r.is_active === false && ` · ${t('admin.detail.inactive')}`}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                <p className="note">{t('admin.detail.rosterHint')}</p>
              </AdminCard>

              <AdminCard title={t('admin.detail.results')}>
                {d.encounters.length === 0 ? (
                  <p className="muted">{t('admin.detail.noItems')}</p>
                ) : (
                  <ul className="list">
                    {d.encounters.map((e) => (
                      <EncounterRow key={e.id} encounter={e} showDate showStatus to={`/admin/encounters/${e.id}`} />
                    ))}
                  </ul>
                )}
              </AdminCard>
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Player: team registrations by season / division / team
// ---------------------------------------------------------------------------------------------
export function PlayerDetailPage() {
  const { t } = useTranslation();
  const { playerId = '' } = useParams();
  const data = useAsync(async () => {
    if (!isUuid(playerId)) return null;
    const [players, regs, seasons, divisions, teams, divisionTeams, clubs] = await Promise.all([
      listRowsWhere('players', { id: playerId }),
      listRowsWhere('team_registrations', { player_id: playerId }),
      listRows('seasons', [{ column: 'name', ascending: false }]),
      listRows('divisions', [{ column: 'sort_order' }]),
      listRows('teams', [{ column: 'name' }]),
      listRows('division_teams', []),
      listRows('clubs', [{ column: 'name' }]),
    ]);
    return players[0] ? { player: players[0], regs, seasons, divisions, teams, divisionTeams, clubs } : null;
  }, [playerId]);
  const [draft, setDraft] = useState({ season: '', division: '', team: '' });
  const action = useAdminAction(data.reload);

  return (
    <div className="admin-page">
      <AdminBack to="/admin/players" label={t('admin.nav.players')} />
      <AsyncBoundary state={data}>
        {(d) => {
          if (!d) return <EmptyState>{t('live.notFound')}</EmptyState>;
          const name = (rows: AdminRow[], id: unknown, key = 'name') => str(rows.find((r) => r.id === id)?.[key]);
          const club = d.clubs.find((c) => c.id === d.player.club_id);
          const divisionsOfSeason = d.divisions.filter((x) => x.season_id === draft.season);
          const teamsOfDivision = d.teams.filter((tm) => d.divisionTeams.some((dt) => dt.division_id === draft.division && dt.team_id === tm.id));
          const teamOptions = (teamsOfDivision.length ? teamsOfDivision : d.teams).map((tm) => ({ value: str(tm.id), label: str(tm.name) }));
          return (
            <>
              <div className="admin-page__head">
                <div>
                  <h1 className="admin-page__title">{str(d.player.full_name)}</h1>
                  <p className="muted">
                    {club && <Link to={`/admin/clubs/${str(club.id)}`}>{str(club.name)}</Link>}
                    {activeLabel(t, d.player) && ` · ${activeLabel(t, d.player)}`}
                  </p>
                </div>
              </div>

              <AdminCard title={t('admin.detail.registrations')}>
                {d.regs.length === 0 ? (
                  <p className="muted">{t('admin.detail.noItems')}</p>
                ) : (
                  <ul className="list">
                    {d.regs.map((r) => (
                      <li key={str(r.id)} className="admin-reg">
                        <span>
                          <Link to={`/admin/teams/${str(r.team_id)}`}>{name(d.teams, r.team_id)}</Link>
                          <span className="muted">
                            {' · '}
                            {name(d.divisions, r.division_id)} · {name(d.seasons, r.season_id)}
                          </span>
                        </span>
                        <label className="checkbox-field checkbox-field--compact">
                          <input
                            type="checkbox"
                            checked={r.is_active !== false}
                            disabled={action.busy}
                            onChange={(e) => void action.run(() => updateRow('team_registrations', { id: r.id }, { is_active: e.target.checked }))}
                          />
                          <span>{t('admin.fields.isActive')}</span>
                        </label>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          aria-label={t('common.delete')}
                          disabled={action.busy}
                          onClick={() => window.confirm(t('admin.crud.confirmDelete')) && void action.run(() => deleteRow('team_registrations', { id: r.id }))}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="inline-form inline-form--wrap">
                  <AdminSelect
                    label={t('admin.fields.season')}
                    value={draft.season}
                    onChange={(season) => setDraft({ season, division: '', team: '' })}
                    options={d.seasons.map((s) => ({ value: str(s.id), label: str(s.name) }))}
                  />
                  <AdminSelect
                    label={t('admin.fields.division')}
                    value={draft.division}
                    onChange={(division) => setDraft((x) => ({ ...x, division, team: '' }))}
                    options={divisionsOfSeason.map((x) => ({ value: str(x.id), label: str(x.name) }))}
                  />
                  <AdminSelect
                    label={t('admin.fields.team')}
                    value={draft.team}
                    onChange={(team) => setDraft((x) => ({ ...x, team }))}
                    options={teamOptions}
                  />
                  <Button
                    size="sm"
                    icon={<Plus size={16} aria-hidden />}
                    disabled={!draft.season || !draft.division || !draft.team || action.busy}
                    onClick={() =>
                      void action
                        .run(() =>
                          insertRow('team_registrations', {
                            player_id: playerId,
                            team_id: draft.team,
                            season_id: draft.season,
                            division_id: draft.division,
                          }),
                        )
                        .then((ok) => ok && setDraft({ season: '', division: '', team: '' }))
                    }
                  >
                    {t('admin.detail.addRegistration')}
                  </Button>
                </div>
                <AdminError error={action.error} />
              </AdminCard>
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Division: format, teams entered, rounds
// ---------------------------------------------------------------------------------------------
export function DivisionDetailPage() {
  const { t } = useTranslation();
  const { divisionId = '' } = useParams();
  const data = useAsync(async () => {
    if (!isUuid(divisionId)) return null;
    const [divisions, entries, teams, rounds] = await Promise.all([
      listRowsWhere('divisions', { id: divisionId }),
      listRowsWhere('division_teams', { division_id: divisionId }),
      listRows('teams', [{ column: 'name' }]),
      listRowsWhere('rounds', { division_id: divisionId }, [{ column: 'number' }]),
    ]);
    if (!divisions[0]) return null;
    const [seasons, seasonEntries] = await Promise.all([
      listRowsWhere('seasons', { id: str(divisions[0].season_id) }),
      listRowsWhere('division_teams', { season_id: str(divisions[0].season_id) }),
    ]);
    return { division: divisions[0], season: seasons[0] ?? null, entries, seasonEntries, teams, rounds };
  }, [divisionId]);
  const [addTeam, setAddTeam] = useState('');
  const action = useAdminAction(data.reload);
  const teamName = useMemo(() => (id: unknown) => str(data.data?.teams.find((x) => x.id === id)?.name), [data.data]);

  return (
    <div className="admin-page">
      <AdminBack to="/admin/divisions" label={t('admin.nav.divisions')} />
      <AsyncBoundary state={data}>
        {(d) => {
          if (!d) return <EmptyState>{t('live.notFound')}</EmptyState>;
          // One division per season: teams already in any division this season are not offered.
          const inSeason = new Set(d.seasonEntries.map((e) => str(e.team_id)));
          const addable = d.teams.filter((x) => !inSeason.has(str(x.id)) && x.is_active !== false);
          return (
            <>
              <div className="admin-page__head">
                <div>
                  <h1 className="admin-page__title">{str(d.division.name)}</h1>
                  <p className="muted">
                    {str(d.season?.name)} · {t(`admin.formats.${str(d.division.format_key) || 'REGULAR_TEN_MATCH'}`)}
                  </p>
                </div>
              </div>

              <AdminCard title={t('admin.detail.teamsInDivision')}>
                {d.entries.length === 0 ? (
                  <p className="muted">{t('admin.detail.noItems')}</p>
                ) : (
                  <ul className="list">
                    {[...d.entries]
                      .sort((a, b) => teamName(a.team_id).localeCompare(teamName(b.team_id), 'is'))
                      .map((e) => (
                        <li key={str(e.team_id)} className="admin-link-row">
                          <Link to={`/admin/teams/${str(e.team_id)}`}>{teamName(e.team_id)}</Link>
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            aria-label={t('admin.detail.remove')}
                            disabled={action.busy}
                            onClick={() => window.confirm(t('admin.crud.confirmDelete')) && void action.run(() => deleteRow('division_teams', { division_id: divisionId, team_id: e.team_id }))}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                {addable.length > 0 && (
                  <div className="inline-form">
                    <AdminSelect
                      label={t('admin.detail.addTeam')}
                      value={addTeam}
                      onChange={setAddTeam}
                      options={addable.map((x) => ({ value: str(x.id), label: str(x.name) }))}
                    />
                    <Button
                      size="sm"
                      icon={<Plus size={16} aria-hidden />}
                      disabled={!addTeam || action.busy}
                      onClick={() => void action.run(() => insertRow('division_teams', { division_id: divisionId, team_id: addTeam })).then(() => setAddTeam(''))}
                    >
                      {t('admin.crud.add')}
                    </Button>
                  </div>
                )}
                <AdminError error={action.error} />
              </AdminCard>

              <AdminCard title={t('admin.nav.rounds')}>
                <LinkList
                  rows={d.rounds}
                  label={(r) => `${t('round.label', { number: str(r.number) })} · ${formatDate(str(r.round_date))}`}
                  to={(r) => `/admin/rounds/${str(r.id)}`}
                  extra={(r) => str(r.venue) || null}
                />
              </AdminCard>
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
