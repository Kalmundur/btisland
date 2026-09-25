import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Copy, RefreshCw, Ban, Check } from 'lucide-react';
import { Button } from '../../components/Button';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { getRound, listRoundEncounters } from '../../data/leagueRepository';
import { deactivateRoundCode, listRoundCodes, regenerateRoundCode } from '../../data/adminRepository';
import { formatRoundCode } from '../../domain/roundCode';
import { formatDate, formatDateTime, formatTime } from '../../lib/format';

/** Round detail for organizers: access code (see/copy/regenerate/deactivate) + encounters. */
export function RoundDetailPage() {
  const { t } = useTranslation();
  const { roundId = '' } = useParams();
  const data = useAsync(async () => {
    const [round, codes, encounters] = await Promise.all([
      getRound(roundId),
      listRoundCodes(roundId),
      listRoundEncounters(roundId),
    ]);
    return { round, codes, encounters };
  }, [roundId]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (fn: () => Promise<unknown>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await fn();
      data.reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable – the code is visible anyway */
    }
  };

  return (
    <div className="admin-page">
      <Link to="/admin/rounds" className="admin-back">
        <ChevronLeft size={18} aria-hidden /> {t('admin.nav.rounds')}
      </Link>
      <AsyncBoundary state={data}>
        {({ round, codes, encounters }) => {
          if (!round) return <EmptyState>{t('live.notFound')}</EmptyState>;
          const active = codes.find((c) => c.isActive);
          const history = codes.filter((c) => !c.isActive);
          return (
            <>
              <div className="admin-page__head">
                <div>
                  <h1 className="admin-page__title">{t('round.label', { number: round.number })}</h1>
                  <p className="muted">
                    {formatDate(round.date)} · {formatTime(round.startTime) ?? t('common.tba')}
                    {round.venue ? ` · ${round.venue}` : ''}
                  </p>
                </div>
              </div>

              <section className="admin-card">
                <h2 className="admin-card__title">{t('admin.codes.title')}</h2>
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
                        disabled={busy}
                        onClick={() => void run(() => regenerateRoundCode(round.id), t('admin.codes.confirmRegenerate'))}
                      >
                        {t('admin.codes.regenerate')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Ban size={16} aria-hidden />}
                        disabled={busy}
                        onClick={() => void run(() => deactivateRoundCode(active.id), t('admin.codes.confirmDeactivate'))}
                      >
                        {t('admin.codes.deactivate')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted">{t('admin.codes.none')}</p>
                    <Button size="sm" disabled={busy} onClick={() => void run(() => regenerateRoundCode(round.id), t('admin.codes.confirmRegenerate'))}>
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
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">{t('admin.nav.encounters')}</h2>
                {encounters.length === 0 ? (
                  <p className="muted">{t('live.noEncounters')}</p>
                ) : (
                  <ul className="list">
                    {encounters.map((e) => (
                      <li key={e.id} className="admin-enc">
                        <span>{e.homeTeamName}</span>
                        <span className="muted">{t('common.vs')}</span>
                        <span>{e.awayTeamName}</span>
                        <span className={`badge badge--${e.status}`}>{t(`status.${e.status}`)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
