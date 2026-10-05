import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Ban, CalendarClock, LockOpen, Play, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { Button } from '../../components/Button';
import { MatchList } from '../../components/MatchList';
import { StatusBadge } from '../../components/Encounter';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useDerivedEncounter, useEncounterData, type EncounterData } from '../../hooks/useEncounterData';
import {
  adminClearCorrection,
  adminCorrectGame,
  adminReopenEncounter,
  adminSetEncounterStatus,
  adminUnlockDoubles,
  adminUnlockLineup,
  listEncounterAudit,
  listGameCorrections,
  type AuditEvent,
  type GameCorrection,
} from '../../data/adminRepository';
import { currentConfirmers, resultConfirmationState } from '../../domain/confirmation';
import { isValidGameScore } from '../../domain/tableTennis';
import { formatDate, formatDateTime } from '../../lib/format';
import type { TeamSelection, TeamSide } from '../../domain/types';
import { AdminBack, AdminCard, AdminError, AdminSelect, useAdminAction } from './adminUi';

/**
 * Organizer view of one encounter: everything, including hidden selections and every raw
 * score entry. Consequential controls sit under the secondary "Stjórn" section; each one
 * is audited server-side.
 */
export function EncounterDetailPage() {
  const { t } = useTranslation();
  const { encounterId = '' } = useParams();
  const data = useEncounterData(encounterId, { withEntries: true });
  const extras = useAsync(
    async () => {
      const [audit, corrections] = await Promise.all([listEncounterAudit(encounterId), listGameCorrections(encounterId)]);
      return { audit, corrections };
    },
    [encounterId],
    [data.data], // refresh with the encounter's realtime reloads
  );

  return (
    <div className="admin-page">
      <AdminBack to={data.data?.encounter ? `/admin/rounds/${data.data.encounter.roundId}` : '/admin/rounds'} label={t('admin.nav.rounds')} />
      <AsyncBoundary state={data}>
        {(d) =>
          d.encounter ? (
            <Detail data={d} reload={data.reload} audit={extras.data?.audit ?? []} corrections={extras.data?.corrections ?? []} />
          ) : (
            <EmptyState>{t('live.notFound')}</EmptyState>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

function Detail({
  data,
  reload,
  audit,
  corrections,
}: {
  data: EncounterData;
  reload: () => void;
  audit: AuditEvent[];
  corrections: GameCorrection[];
}) {
  const { t } = useTranslation();
  const state = useDerivedEncounter(data)!;
  const e = data.encounter!;
  const action = useAdminAction(reload);
  const confirmations = resultConfirmationState(data.confirmations, e.resultHash);
  const teamName = (side: TeamSide) => (side === 'home' ? e.homeTeamName : e.awayTeamName);
  const name = (id: string) => data.names[id] ?? id.slice(0, 8);

  const withReason = (fn: (reason: string) => Promise<void>) => {
    const reason = window.prompt(t('admin.match.reasonPrompt'));
    if (reason === null) return;
    void action.run(() => fn(reason));
  };

  const selectionCard = (kind: 'lineup' | 'doubles', sel: TeamSelection | undefined, side: TeamSide, players: Array<[string, string | undefined]>) => (
    <div key={`${kind}-${side}`} className="admin-sel">
      <div className="admin-sel__head">
        <strong>{teamName(side)}</strong>
        {sel ? (
          <span className="muted">
            {t('selection.version', { version: sel.version })} ·{' '}
            {sel.lockedAt
              ? t(kind === 'lineup' ? 'selection.lineupLocked' : 'selection.doublesLocked')
              : t('selection.progress', { count: currentConfirmers(sel).length })}
          </span>
        ) : (
          <span className="muted">{t(kind === 'lineup' ? 'selection.lineupMissing' : 'selection.doublesMissing')}</span>
        )}
      </div>
      {sel && (
        <ul className="admin-sel__list">
          {players.map(([slot, id]) => (
            <li key={slot}>
              <span className="selection__letter">{slot}</span> {id ? name(id) : '—'}
            </li>
          ))}
        </ul>
      )}
      {sel && currentConfirmers(sel).length > 0 && (
        <p className="muted admin-sel__confirmers">
          {t('admin.match.confirmedBy')}: {currentConfirmers(sel).map(name).join(', ')}
        </p>
      )}
    </div>
  );

  const lineup = (side: TeamSide) => data.lineups.find((l) => l.side === side);
  const doubles = (side: TeamSide) => data.doubles.find((d) => d.side === side);
  const entries = [...data.entries].sort(
    (a, b) => a.matchNumber - b.matchNumber || a.gameNumber - b.gameNumber || a.updatedAt.localeCompare(b.updatedAt),
  );
  const conflictKeys = new Set(data.reconciled.filter((r) => r.status === 'conflict').map((r) => `${r.matchNumber}:${r.gameNumber}`));
  const official = e.status === 'completed';

  return (
    <>
      <div className="admin-page__head">
        <div>
          <h1 className="admin-page__title">
            {e.homeTeamName} {state.homeScore}–{state.awayScore} {e.awayTeamName}
          </h1>
          <p className="muted">
            <Link to={`/admin/rounds/${e.roundId}`}>{t('round.label', { number: e.round.number })}</Link> · {formatDate(e.round.date)} · v
            {e.resultVersion}
          </p>
        </div>
        <StatusBadge status={e.status} />
      </div>
      {state.hasOpenConflict && <p className="warning-text">{t('admin.match.hasConflicts', { count: conflictKeys.size })}</p>}

      <AdminCard title={t('admin.match.lineupStatus')}>
        {!e.lineupsRevealedAt && <p className="note">{t('admin.match.hiddenNote')}</p>}
        <div className="admin-sel-grid">
          {(['home', 'away'] as const).map((side) => {
            const l = lineup(side);
            return selectionCard('lineup', l, side, (l?.slots ?? []).map((s) => [s.slot, s.playerId]));
          })}
        </div>
      </AdminCard>

      {(data.doubles.length > 0 || state.doublesSelectionOpen) && (
        <AdminCard title={t('selection.doublesTitle')}>
          <div className="admin-sel-grid">
            {(['home', 'away'] as const).map((side) => {
              const d = doubles(side);
              return selectionCard('doubles', d, side, [['1', d?.playerIds[0]], ['2', d?.playerIds[1]]]);
            })}
          </div>
        </AdminCard>
      )}

      <AdminCard title={t('live.games')}>
        <MatchList state={state} data={data} showGames />
      </AdminCard>

      <AdminCard title={t('admin.match.entries')}>
        {entries.length === 0 ? (
          <p className="muted">{t('admin.crud.empty')}</p>
        ) : (
          <div className="table-scroll">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th>{t('admin.match.match')}</th>
                  <th>{t('admin.match.game')}</th>
                  <th>{t('admin.match.scorer')}</th>
                  <th className="table__num">{t('admin.match.points')}</th>
                  <th>{t('admin.match.updated')}</th>
                  <th>{t('admin.match.clientId')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((en) => (
                  <tr key={en.id} className={conflictKeys.has(`${en.matchNumber}:${en.gameNumber}`) ? 'admin-table__row--conflict' : undefined}>
                    <td className="num">{en.matchNumber}</td>
                    <td className="num">{en.gameNumber}</td>
                    <td>
                      {name(en.submittedByPlayerId)} <span className="muted">({t(`side.${en.side}`)})</span>
                    </td>
                    <td className="table__num num">
                      {en.homePoints}–{en.awayPoints}
                    </td>
                    <td className="num">{formatDateTime(en.updatedAt)}</td>
                    <td className="muted num">{en.clientEntryId.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard title={t('admin.match.conflictConfirmations')}>
        <p className="note">{t('admin.match.conflictConfirmationsHint')}</p>
        {data.conflictConfirmations.length === 0 ? (
          <p className="muted">{t('admin.crud.empty')}</p>
        ) : (
          <div className="table-scroll">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th>{t('admin.match.match')}</th>
                  <th>{t('admin.match.game')}</th>
                  <th>{t('admin.match.resolvedBy')}</th>
                  <th className="table__num">{t('admin.match.points')}</th>
                  <th>{t('admin.match.updated')}</th>
                  <th>{t('admin.match.confirmationState')}</th>
                </tr>
              </thead>
              <tbody>
                {data.conflictConfirmations.map((c) => (
                  <tr key={c.id} className={c.supersededAt ? 'muted' : undefined}>
                    <td className="num">{c.matchNumber}</td>
                    <td className="num">{c.gameNumber}</td>
                    <td>
                      {name(c.playerId)} <span className="muted">({t(`side.${c.side}`)})</span>
                    </td>
                    <td className="table__num num">
                      {c.homePoints}–{c.awayPoints}
                    </td>
                    <td className="num">{formatDateTime(c.createdAt)}</td>
                    <td>{c.supersededAt ? t('admin.match.confirmationSuperseded') : t('admin.match.confirmationActive')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard title={t('result.title')}>
        {data.confirmations.length === 0 ? (
          <p className="muted">{t('admin.crud.empty')}</p>
        ) : (
          <ul className="list">
            {data.confirmations.map((c) => {
              const valid = !c.invalidatedAt && c.resultHash === e.resultHash;
              return (
                <li key={c.id} className="admin-enc">
                  <span>{teamName(c.side)}</span>
                  <span>{name(c.playerId)}</span>
                  <span className="muted num">
                    v{c.resultVersion} · {formatDateTime(c.createdAt)}
                  </span>
                  <span className={`badge ${valid ? 'badge--lineups' : 'badge--cancelled'}`}>{valid ? t('admin.match.valid') : t('admin.match.invalid')}</span>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>

      <details className="admin-control">
        <summary className="admin-control__summary">
          <Wrench size={16} aria-hidden /> {t('admin.match.control')}
        </summary>
        <div className="admin-control__body">
          <AdminError error={action.error} />

          <AdminCard title={t('admin.match.roundSettings')}>
            <p className="note">{t('admin.match.roundSettingsHint')}</p>
            <Link to={`/admin/rounds/${e.roundId}`} className="btn btn--secondary btn--sm">
              {t('round.label', { number: e.round.number })}
            </Link>
          </AdminCard>

          <AdminCard title={t('admin.match.selections')}>
            <div className="button-row">
              {(['home', 'away'] as const).map((side) => {
                const l = lineup(side);
                return (
                  l?.lockedAt &&
                  !official && (
                    <Button
                      key={`l-${side}`}
                      variant="secondary"
                      size="sm"
                      icon={<LockOpen size={14} aria-hidden />}
                      disabled={action.busy}
                      onClick={() => withReason((r) => adminUnlockLineup(l.id, r))}
                    >
                      {t('admin.match.unlockLineup')} · {teamName(side)}
                    </Button>
                  )
                );
              })}
              {(['home', 'away'] as const).map((side) => {
                const d = doubles(side);
                return (
                  d?.lockedAt &&
                  !official && (
                    <Button
                      key={`d-${side}`}
                      variant="secondary"
                      size="sm"
                      icon={<LockOpen size={14} aria-hidden />}
                      disabled={action.busy}
                      onClick={() => withReason((r) => adminUnlockDoubles(d.id, r))}
                    >
                      {t('admin.match.unlockDoubles')} · {teamName(side)}
                    </Button>
                  )
                );
              })}
            </div>
          </AdminCard>

          <CorrectionForm encounterId={e.id} corrections={corrections} busy={action.busy} run={action.run} />

          <AdminCard title={t('admin.match.statusControls')}>
            <div className="button-row">
              {e.status !== 'postponed' && e.status !== 'completed' && (
                <Button variant="secondary" size="sm" icon={<CalendarClock size={14} aria-hidden />} disabled={action.busy} onClick={() => withReason((r) => adminSetEncounterStatus(e.id, 'postponed', r))}>
                  {t('admin.match.postpone')}
                </Button>
              )}
              {e.status !== 'cancelled' && e.status !== 'completed' && (
                <Button variant="danger" size="sm" icon={<Ban size={14} aria-hidden />} disabled={action.busy} onClick={() => withReason((r) => adminSetEncounterStatus(e.id, 'cancelled', r))}>
                  {t('admin.match.cancel')}
                </Button>
              )}
              {(e.status === 'postponed' || e.status === 'cancelled') && (
                <Button variant="secondary" size="sm" icon={<Play size={14} aria-hidden />} disabled={action.busy} onClick={() => withReason((r) => adminSetEncounterStatus(e.id, 'active', r))}>
                  {t('admin.match.restore')}
                </Button>
              )}
              {(official || confirmations.home || confirmations.away) && (
                <Button variant="danger" size="sm" icon={<RotateCcw size={14} aria-hidden />} disabled={action.busy} onClick={() => withReason((r) => adminReopenEncounter(e.id, r))}>
                  {t('admin.match.reopen')}
                </Button>
              )}
            </div>
          </AdminCard>

          <AdminCard title={t('admin.match.history')}>
            {audit.length === 0 ? (
              <p className="muted">{t('admin.crud.empty')}</p>
            ) : (
              <ul className="list">
                {audit.map((a) => (
                  <li key={a.id} className="admin-audit">
                    <span className="num muted">{formatDateTime(a.createdAt)}</span>
                    <span>
                      {t(`admin.match.actions.${a.action}`, { defaultValue: a.action })} · <span className="muted">{a.entityTable}</span>
                    </span>
                    <span className="muted">
                      {(a.details as { reason?: string } | null)?.reason ?? ''}
                      {a.actorUserId ? ` · ${a.actorUserId.slice(0, 8)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        </div>
      </details>
    </>
  );
}

/** Correct (override) one game's score. Scorers' raw entries are kept; the result re-derives. */
function CorrectionForm({
  encounterId,
  corrections,
  busy,
  run,
}: {
  encounterId: string;
  corrections: GameCorrection[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ match: '', game: '', home: '', away: '', reason: '' });
  const home = Number(form.home);
  const away = Number(form.away);
  const valid = !!form.match && !!form.game && form.home !== '' && form.away !== '' && isValidGameScore(home, away) && form.reason.trim() !== '';
  const numbers = (n: number) => Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

  return (
    <AdminCard title={t('admin.match.correctGame')}>
      <p className="note">{t('admin.match.correctionHint')}</p>
      {corrections.length > 0 && (
        <ul className="list">
          {corrections.map((c) => (
            <li key={`${c.matchNumber}:${c.gameNumber}`} className="admin-link-row">
              <span className="num">
                {t('admin.match.match')} {c.matchNumber} · {t('admin.match.game')} {c.gameNumber}: <strong>{c.homePoints}–{c.awayPoints}</strong>
                <span className="muted"> · {c.reason}</span>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={t('admin.match.clearCorrection')}
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt(t('admin.match.reasonPrompt'));
                  if (reason !== null) void run(() => adminClearCorrection(encounterId, c.matchNumber, c.gameNumber, reason));
                }}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form inline-form--wrap">
        <AdminSelect label={t('admin.match.match')} value={form.match} onChange={(match) => setForm((f) => ({ ...f, match }))} options={numbers(10)} />
        <AdminSelect label={t('admin.match.game')} value={form.game} onChange={(game) => setForm((f) => ({ ...f, game }))} options={numbers(5)} />
        <label className="field field--narrow">
          <span className="field__label">{t('side.home')}</span>
          <input className="field__control num" inputMode="numeric" value={form.home} onChange={(e) => setForm((f) => ({ ...f, home: e.target.value.replace(/\D/g, '') }))} />
        </label>
        <label className="field field--narrow">
          <span className="field__label">{t('side.away')}</span>
          <input className="field__control num" inputMode="numeric" value={form.away} onChange={(e) => setForm((f) => ({ ...f, away: e.target.value.replace(/\D/g, '') }))} />
        </label>
        <label className="field field--grow">
          <span className="field__label">{t('admin.match.reason')}</span>
          <input className="field__control" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </label>
        <Button
          size="sm"
          disabled={!valid || busy}
          onClick={() =>
            void run(() => adminCorrectGame(encounterId, Number(form.match), Number(form.game), home, away, form.reason.trim())).then(
              (ok) => ok && setForm({ match: '', game: '', home: '', away: '', reason: '' }),
            )
          }
        >
          {t('admin.match.applyCorrection')}
        </Button>
      </div>
    </AdminCard>
  );
}
