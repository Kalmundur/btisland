import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, LockOpen, RotateCcw } from 'lucide-react';
import { Button } from '../../components/Button';
import { MatchList } from '../../components/MatchList';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useDerivedEncounter, useEncounterData, type EncounterData } from '../../hooks/useEncounterData';
import {
  adminReopenEncounter,
  adminUnlockDoubles,
  adminUnlockLineup,
  listEncounterAudit,
} from '../../data/adminRepository';
import { currentConfirmers, resultConfirmationState } from '../../domain/confirmation';
import { formatDateTime } from '../../lib/format';
import type { TeamSelection } from '../../domain/types';

/** Organizer view of one encounter: everything, including hidden selections and raw entries. */
export function EncounterDetailPage() {
  const { t } = useTranslation();
  const { encounterId = '' } = useParams();
  const data = useEncounterData(encounterId, { withEntries: true });
  const audit = useAsync(() => listEncounterAudit(encounterId), [encounterId, data.data]);

  return (
    <div className="admin-page">
      <Link to="/admin/encounters" className="admin-back">
        <ChevronLeft size={18} aria-hidden /> {t('admin.nav.encounters')}
      </Link>
      <AsyncBoundary state={data}>
        {(d) =>
          d.encounter ? (
            <Detail data={d} reload={data.reload} audit={audit.data ?? []} />
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
}: {
  data: EncounterData;
  reload: () => void;
  audit: Awaited<ReturnType<typeof listEncounterAudit>>;
}) {
  const { t } = useTranslation();
  const state = useDerivedEncounter(data)!;
  const e = data.encounter!;
  const [busy, setBusy] = useState(false);
  const confirmations = resultConfirmationState(data.confirmations, e.resultHash);
  const teamName = (side: 'home' | 'away') => (side === 'home' ? e.homeTeamName : e.awayTeamName);

  const act = async (fn: (reason: string) => Promise<void>) => {
    const reason = window.prompt(t('admin.match.reasonPrompt'));
    if (reason === null) return;
    setBusy(true);
    try {
      await fn(reason);
      reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const selectionCard = (kind: 'lineup' | 'doubles', sel: TeamSelection | undefined, side: 'home' | 'away', players: Array<[string, string | undefined]>) => (
    <div key={`${kind}-${side}`} className="admin-sel">
      <div className="admin-sel__head">
        <strong>{teamName(side)}</strong>
        {sel ? (
          <span className="muted">
            {t('selection.version', { version: sel.version })} ·{' '}
            {sel.lockedAt ? t(kind === 'lineup' ? 'selection.lineupLocked' : 'selection.doublesLocked') : t('selection.progress', { count: currentConfirmers(sel).length })}
          </span>
        ) : (
          <span className="muted">{t(kind === 'lineup' ? 'selection.lineupMissing' : 'selection.doublesMissing')}</span>
        )}
      </div>
      {sel && (
        <ul className="admin-sel__list">
          {players.map(([slot, id]) => (
            <li key={slot}>
              <span className="selection__letter">{slot}</span> {id ? (data.names[id] ?? id) : '—'}
            </li>
          ))}
        </ul>
      )}
      {sel && (
        <p className="muted admin-sel__confirmers">
          {currentConfirmers(sel).map((id) => data.names[id] ?? id).join(', ')}
        </p>
      )}
      {sel?.lockedAt && e.status !== 'completed' && (
        <Button
          variant="secondary"
          size="sm"
          icon={<LockOpen size={14} aria-hidden />}
          disabled={busy}
          onClick={() => void act((r) => (kind === 'lineup' ? adminUnlockLineup(sel.id, r) : adminUnlockDoubles(sel.id, r)))}
        >
          {t(kind === 'lineup' ? 'admin.match.unlockLineup' : 'admin.match.unlockDoubles')}
        </Button>
      )}
    </div>
  );

  const lineup = (side: 'home' | 'away') => data.lineups.find((l) => l.side === side);
  const doubles = (side: 'home' | 'away') => data.doubles.find((d) => d.side === side);
  const entries = [...data.entries].sort(
    (a, b) => a.matchNumber - b.matchNumber || a.gameNumber - b.gameNumber || a.updatedAt.localeCompare(b.updatedAt),
  );
  const conflictKeys = new Set(data.reconciled.filter((r) => r.status === 'conflict').map((r) => `${r.matchNumber}:${r.gameNumber}`));

  return (
    <>
      <div className="admin-page__head">
        <div>
          <h1 className="admin-page__title">
            {e.homeTeamName} {state.homeScore}–{state.awayScore} {e.awayTeamName}
          </h1>
          <p className="muted">
            {t('round.label', { number: e.round.number })} · {t(`status.${e.status}`)} · v{e.resultVersion}
          </p>
        </div>
        {(e.status === 'completed' || confirmations.home || confirmations.away) && (
          <Button
            variant="danger"
            size="sm"
            icon={<RotateCcw size={14} aria-hidden />}
            disabled={busy}
            onClick={() => void act((r) => adminReopenEncounter(e.id, r))}
          >
            {t('admin.match.reopen')}
          </Button>
        )}
      </div>

      <section className="admin-card">
        <h2 className="admin-card__title">{t('selection.lineupTitle')}</h2>
        <div className="admin-sel-grid">
          {(['home', 'away'] as const).map((side) => {
            const l = lineup(side);
            return selectionCard('lineup', l, side, (l?.slots ?? []).map((s) => [s.slot, s.playerId]));
          })}
        </div>
      </section>

      {(data.doubles.length > 0 || state.doublesSelectionOpen) && (
        <section className="admin-card">
          <h2 className="admin-card__title">{t('selection.doublesTitle')}</h2>
          <div className="admin-sel-grid">
            {(['home', 'away'] as const).map((side) => {
              const d = doubles(side);
              return selectionCard('doubles', d, side, [['1', d?.playerIds[0]], ['2', d?.playerIds[1]]]);
            })}
          </div>
        </section>
      )}

      <section className="admin-card">
        <h2 className="admin-card__title">{t('live.games')}</h2>
        <MatchList state={state} data={data} showGames />
      </section>

      <section className="admin-card">
        <h2 className="admin-card__title">{t('admin.match.entries')}</h2>
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
                      {data.names[en.submittedByPlayerId] ?? en.submittedByPlayerId} <span className="muted">({t(`side.${en.side}`)})</span>
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
      </section>

      <section className="admin-card">
        <h2 className="admin-card__title">{t('result.title')}</h2>
        {data.confirmations.length === 0 ? (
          <p className="muted">{t('admin.crud.empty')}</p>
        ) : (
          <ul className="list">
            {data.confirmations.map((c) => {
              const valid = !c.invalidatedAt && c.resultHash === e.resultHash;
              return (
                <li key={c.id} className="admin-enc">
                  <span>{teamName(c.side)}</span>
                  <span>{data.names[c.playerId] ?? c.playerId}</span>
                  <span className="muted num">v{c.resultVersion} · {formatDateTime(c.createdAt)}</span>
                  <span className={`badge ${valid ? 'badge--lineups' : 'badge--cancelled'}`}>
                    {valid ? t('admin.match.valid') : t('admin.match.invalid')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {audit.length > 0 && (
        <section className="admin-card">
          <h2 className="admin-card__title">{t('admin.match.audit')}</h2>
          <ul className="list">
            {audit.map((a) => (
              <li key={a.id} className="admin-audit">
                <span className="num muted">{formatDateTime(a.createdAt)}</span>
                <span>{t(`admin.match.actions.${a.action}`, { defaultValue: a.action })}</span>
                <span className="muted">{(a.details as { reason?: string } | null)?.reason ?? ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
