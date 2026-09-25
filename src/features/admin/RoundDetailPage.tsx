import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Ban, Check, Copy, Pencil, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../components/Button';
import { EncounterRow } from '../../components/Encounter';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { getDivision, getRound, listConflictCounts, listDivisionTeams, listRoundEncounters } from '../../data/leagueRepository';
import { deactivateRoundCode, insertRow, listRoundCodes, regenerateRoundCode, updateRow } from '../../data/adminRepository';
import { subscribeToEncounterSet } from '../../data/encounterRepository';
import { formatRoundCode } from '../../domain/roundCode';
import { deriveRoundStatus } from '../../domain/rounds';
import { formatDate, formatDateTime, formatTime } from '../../lib/format';
import { AdminBack, AdminCard, AdminError, AdminSelect, useAdminAction } from './adminUi';

/**
 * Round = pre-event setup (details, code, fixtures), live control center (live scores,
 * conflicts) and post-event archive. The round status is derived, never maintained.
 */
export function RoundDetailPage() {
  const { t } = useTranslation();
  const { roundId = '' } = useParams();
  const data = useAsync(async () => {
    const round = await getRound(roundId);
    if (!round) return null;
    const [codes, encounters, division, teams] = await Promise.all([
      listRoundCodes(roundId),
      listRoundEncounters(roundId),
      getDivision(round.divisionId),
      listDivisionTeams(round.divisionId),
    ]);
    const conflicts = await listConflictCounts(encounters.map((e) => e.id));
    return { round, codes, encounters, division, teams, conflicts };
  }, [roundId]);

  const ids = data.data?.encounters.map((e) => e.id).join(',') ?? '';
  const { reload } = data;
  useEffect(() => (ids ? subscribeToEncounterSet(ids.split(','), reload) : undefined), [ids, reload]);

  const action = useAdminAction(reload);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ date: '', time: '', venue: '' });
  const [fixture, setFixture] = useState({ home: '', away: '' });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the code is visible anyway */
    }
  };

  return (
    <div className="admin-page">
      <AdminBack to="/admin/rounds" label={t('admin.nav.rounds')} />
      <AsyncBoundary state={data}>
        {(d) => {
          if (!d) return <EmptyState>{t('live.notFound')}</EmptyState>;
          const status = deriveRoundStatus(d.encounters);
          const active = d.codes.find((c) => c.isActive);
          const history = d.codes.filter((c) => !c.isActive);
          const busyTeams = new Set(d.encounters.flatMap((e) => [e.homeTeamId, e.awayTeamId]));
          const teamOptions = d.teams.map((tm) => ({ value: tm.id, label: busyTeams.has(tm.id) ? `${tm.name} *` : tm.name }));
          return (
            <>
              <div className="admin-page__head">
                <div>
                  <h1 className="admin-page__title">{t('round.label', { number: d.round.number })}</h1>
                  <p className="muted">
                    {d.division?.name} · {d.division?.season?.name}
                  </p>
                </div>
                <span className={`round-status round-status--${status}`}>{t(`roundStatus.${status}`)}</span>
              </div>

              <AdminCard
                title={t('admin.detail.details')}
                actions={
                  !editing && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Pencil size={14} aria-hidden />}
                      onClick={() => {
                        setDetails({ date: d.round.date, time: formatTime(d.round.startTime) ?? '', venue: d.round.venue ?? '' });
                        setEditing(true);
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                  )
                }
              >
                {editing ? (
                  <div className="inline-form inline-form--wrap">
                    <label className="field">
                      <span className="field__label">{t('admin.fields.date')}</span>
                      <input className="field__control" type="date" value={details.date} onChange={(e) => setDetails((x) => ({ ...x, date: e.target.value }))} />
                    </label>
                    <label className="field">
                      <span className="field__label">{t('admin.fields.startTime')}</span>
                      <input className="field__control" type="time" value={details.time} onChange={(e) => setDetails((x) => ({ ...x, time: e.target.value }))} />
                    </label>
                    <label className="field field--grow">
                      <span className="field__label">{t('admin.fields.venue')}</span>
                      <input className="field__control" value={details.venue} onChange={(e) => setDetails((x) => ({ ...x, venue: e.target.value }))} />
                    </label>
                    <div className="button-row">
                      <Button
                        size="sm"
                        disabled={!details.date || action.busy}
                        onClick={() =>
                          void action
                            .run(() =>
                              updateRow('rounds', { id: d.round.id }, {
                                round_date: details.date,
                                start_time: details.time || null,
                                venue: details.venue.trim() || null,
                              }),
                            )
                            .then((ok) => ok && setEditing(false))
                        }
                      >
                        {t('common.save')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <dl className="admin-facts">
                    <dt>{t('admin.fields.date')}</dt>
                    <dd>{formatDate(d.round.date)}</dd>
                    <dt>{t('admin.fields.startTime')}</dt>
                    <dd>{formatTime(d.round.startTime) ?? t('common.tba')}</dd>
                    <dt>{t('admin.fields.venue')}</dt>
                    <dd>{d.round.venue ?? t('common.none')}</dd>
                  </dl>
                )}
              </AdminCard>

              <AdminCard title={t('admin.codes.title')}>
                {active ? (
                  <>
                    <p className="access-code num">{formatRoundCode(active.code)}</p>
                    {active.isDevSeed && <p className="warning-text">{t('admin.codes.devSeed')}</p>}
                    <div className="button-row">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                        onClick={() => void copy(active.code)}
                      >
                        {copied ? t('admin.codes.copied') : t('admin.codes.copy')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw size={16} aria-hidden />}
                        disabled={action.busy}
                        onClick={() => window.confirm(t('admin.codes.confirmRegenerate')) && void action.run(() => regenerateRoundCode(d.round.id))}
                      >
                        {t('admin.codes.regenerate')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Ban size={16} aria-hidden />}
                        disabled={action.busy}
                        onClick={() => window.confirm(t('admin.codes.confirmDeactivate')) && void action.run(() => deactivateRoundCode(active.id))}
                      >
                        {t('admin.codes.deactivate')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted">{t('admin.codes.none')}</p>
                    <Button size="sm" disabled={action.busy} onClick={() => void action.run(() => regenerateRoundCode(d.round.id))}>
                      {t('admin.codes.generate')}
                    </Button>
                  </>
                )}
                {history.length > 0 && (
                  <details className="code-history">
                    <summary>{t('admin.codes.history')}</summary>
                    <ul>
                      {history.map((c) => (
                        <li key={c.id} className="num muted">
                          {formatRoundCode(c.code)} · {formatDateTime(c.createdAt)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </AdminCard>

              <AdminCard title={t('admin.detail.encounters')}>
                {d.encounters.length === 0 ? (
                  <p className="muted">{t('live.noEncounters')}</p>
                ) : (
                  <ul className="list">
                    {d.encounters.map((e) => (
                      <EncounterRow key={e.id} encounter={e} showStatus conflicts={d.conflicts[e.id] ?? 0} to={`/admin/encounters/${e.id}`} />
                    ))}
                  </ul>
                )}
                <div className="inline-form inline-form--wrap">
                  <AdminSelect label={t('admin.fields.homeTeam')} value={fixture.home} onChange={(home) => setFixture((f) => ({ ...f, home }))} options={teamOptions} />
                  <AdminSelect label={t('admin.fields.awayTeam')} value={fixture.away} onChange={(away) => setFixture((f) => ({ ...f, away }))} options={teamOptions} />
                  <Button
                    size="sm"
                    icon={<Plus size={16} aria-hidden />}
                    disabled={!fixture.home || !fixture.away || fixture.home === fixture.away || action.busy}
                    onClick={() =>
                      void action
                        .run(() => insertRow('encounters', { round_id: d.round.id, home_team_id: fixture.home, away_team_id: fixture.away }))
                        .then((ok) => ok && setFixture({ home: '', away: '' }))
                    }
                  >
                    {t('admin.detail.addEncounter')}
                  </Button>
                </div>
                <p className="note">{t('admin.detail.fixtureHint')}</p>
                <AdminError error={action.error} />
              </AdminCard>
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
