import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '../../components/Button';
import type { EncounterState } from '../../domain/encounterState';
import { resultConfirmationState } from '../../domain/confirmation';
import { confirmResult } from '../../data/encounterRepository';
import { useErrorText } from '../../hooks/useErrorText';
import type { EncounterDetail, ResultConfirmation, TeamSide } from '../../domain/types';

/** "Jafntefli 5–5" / "KR-B vann 6–3". */
export function useOutcomeText(encounter: EncounterDetail | null, state: EncounterState | null): string | null {
  const { t } = useTranslation();
  if (!encounter || !state || !state.finished || !state.outcome) return null;
  const score = { home: state.homeScore, away: state.awayScore };
  if (state.outcome === 'draw') return t('match.outcomeDraw', score);
  const team = state.outcome === 'home' ? encounter.homeTeamName : encounter.awayTeamName;
  return t('match.outcomeWin', { team, ...score });
}

/**
 * Final confirmation: one player per team confirms the exact current result (hash).
 * Any later change to the reconciled result invalidates earlier confirmations server-side.
 */
export function ResultPanel({
  encounter,
  state,
  confirmations,
  mySide,
  names,
  onChanged,
}: {
  encounter: EncounterDetail;
  state: EncounterState;
  confirmations: ResultConfirmation[];
  mySide: TeamSide;
  names: Record<string, string>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText('result.errors');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = resultConfirmationState(confirmations, encounter.resultHash);
  const official = encounter.status === 'completed';

  if (official) {
    return (
      <div className="result-panel result-panel--official">
        <p className="result-panel__title">
          <BadgeCheck size={20} aria-hidden /> {t('result.confirmed')}
        </p>
        <p className="note">{t('result.officialNote')}</p>
      </div>
    );
  }

  const mine = status[mySide];
  const confirm = async () => {
    if (!encounter.resultHash) return;
    setBusy(true);
    setError(null);
    try {
      await confirmResult(encounter.id, encounter.resultHash);
      onChanged();
    } catch (e) {
      setError(errorText(e));
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const row = (side: TeamSide, team: string) => {
    const c = status[side];
    return (
      <li className="result-panel__row">
        {c ? <CheckCircle2 size={18} className="accent" aria-hidden /> : <Circle size={18} className="muted" aria-hidden />}
        <span className="result-panel__team">{team}</span>
        <span className={c ? 'accent' : 'muted'}>
          {c ? `${t('result.confirmed')} · ${names[c.playerId] ?? ''}` : t('result.notConfirmed')}
        </span>
      </li>
    );
  };

  return (
    <div className="result-panel">
      <p className="result-panel__title">{t('result.title')}</p>
      {state.hasOpenConflict ? (
        <p className="warning-text">{t('result.conflictsBlock')}</p>
      ) : (
        <p className="note">{t('result.hint')}</p>
      )}
      <ul className="result-panel__list">
        {row('home', encounter.homeTeamName)}
        {row('away', encounter.awayTeamName)}
      </ul>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!mine && !state.hasOpenConflict && (
        <Button block onClick={() => void confirm()} disabled={busy || !encounter.resultHash}>
          {t('result.confirm')}
        </Button>
      )}
    </div>
  );
}
