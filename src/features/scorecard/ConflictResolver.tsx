import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '../../components/Button';
import { conflictCandidates, sameScore, type GameScore } from '../../domain/conflictResolution';
import { isValidGameScore } from '../../domain/tableTennis';
import { confirmGameResolution } from '../../data/encounterRepository';
import type { EncounterData } from '../../hooks/useEncounterData';
import { useErrorText } from '../../hooks/useErrorText';
import { useOnline } from '../../lib/connectivity';
import { newClientEntryId } from '../../offline/scoreSync';
import { ScoreInput, type GameScoreDraft } from './ScoreInput';

const fmt = (s: GameScore) => `${s.home}–${s.away}`;

/**
 * "Leysa ágreining": any player of either team picks the correct score and the game is
 * resolved at once – it is almost always a typo. Candidates are the distinct entered scores
 * (no counts, no names) plus any other valid score. Also used to correct an earlier resolution
 * (`current`) until the encounter is officially confirmed. Online only: nothing is shown as
 * resolved before the server has accepted it.
 */
export function ConflictResolver({
  data,
  matchNumber,
  gameNumber,
  homeName,
  awayName,
  onChanged,
  current = null,
  onClose,
}: {
  data: EncounterData;
  matchNumber: number;
  gameNumber: number;
  homeName: string;
  awayName: string;
  /** Reload after a resolution (realtime would also deliver it). */
  onChanged: () => void;
  /** Correcting an earlier resolution: its score (the panel opens straight away). */
  current?: GameScore | null;
  /** Correcting: close the panel without a change. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const errorText = useErrorText('match.errors');
  const candidates = conflictCandidates(data.entries, matchNumber, gameNumber);

  const [open, setOpen] = useState(!!current);
  const [choice, setChoice] = useState<GameScore | 'other' | null>(null);
  const [other, setOther] = useState<GameScoreDraft>({ home: null, away: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per intended resolution: a double tap or a retry after a timeout reuses it.
  const requestId = useRef<string | null>(null);

  const picked: GameScore | null =
    choice === 'other'
      ? other.home !== null && other.away !== null && isValidGameScore(other.home, other.away)
        ? { home: other.home, away: other.away }
        : null
      : choice;
  const unchanged = sameScore(picked, current);

  const pick = (next: GameScore | 'other') => {
    setChoice(next);
    setError(null);
    requestId.current = null;
  };

  const close = () => {
    setOpen(false);
    setChoice(null);
    setError(null);
    onClose?.();
  };

  const submit = async () => {
    if (!picked || unchanged || !online) return;
    requestId.current ??= newClientEntryId();
    setBusy(true);
    setError(null);
    try {
      await confirmGameResolution({
        clientRequestId: requestId.current,
        encounterId: data.encounter!.id,
        matchNumber,
        gameNumber,
        homePoints: picked.home,
        awayPoints: picked.away,
      });
      requestId.current = null;
      close();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="resolve__open" onClick={() => setOpen(true)}>
        {t('match.resolve.action')}
      </Button>
    );
  }

  return (
    <div className="resolve__panel">
      <p className="resolve__question">{t('match.resolve.question')}</p>
      <div className="resolve__options" role="radiogroup" aria-label={t('match.resolve.question')}>
        {candidates.map((c) => {
          const selected = choice !== 'other' && sameScore(choice, c);
          return (
            <button
              key={fmt(c)}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`resolve__option num${selected ? ' resolve__option--selected' : ''}`}
              onClick={() => pick(c)}
            >
              {fmt(c)}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'other'}
          className={`resolve__option${choice === 'other' ? ' resolve__option--selected' : ''}`}
          onClick={() => pick('other')}
        >
          {t('match.resolve.other')}
        </button>
      </div>

      {choice === 'other' && (
        <ScoreInput
          home={{ name: homeName, letter: null }}
          away={{ name: awayName, letter: null }}
          value={other}
          onChange={(v) => {
            setOther(v);
            requestId.current = null;
          }}
          onSubmit={() => void submit()}
        />
      )}

      {!online && <p className="note">{t('match.resolve.offline')}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-stack">
        <Button block icon={<Check size={18} aria-hidden />} onClick={() => void submit()} disabled={!picked || unchanged || !online || busy}>
          {t('match.resolve.confirm')}
        </Button>
        <Button variant="ghost" block onClick={close} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
