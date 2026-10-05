import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '../../components/Button';
import { conflictCandidates, teamResolution, type GameScore } from '../../domain/conflictResolution';
import { isValidGameScore } from '../../domain/tableTennis';
import type { TeamSide } from '../../domain/types';
import { confirmGameResolution } from '../../data/encounterRepository';
import type { EncounterData } from '../../hooks/useEncounterData';
import { useErrorText } from '../../hooks/useErrorText';
import { useOnline } from '../../lib/connectivity';
import { newClientEntryId } from '../../offline/scoreSync';
import { ScoreInput, type GameScoreDraft } from './ScoreInput';

const fmt = (s: GameScore) => `${s.home}–${s.away}`;
const same = (a: GameScore | null, b: GameScore | null) => !!a && !!b && a.home === b.home && a.away === b.away;

/**
 * "Leysa ágreining": when the scorer whose entry differs is unavailable, one player from each
 * team confirms the correct score. Candidates are the distinct entered scores (no counts – the
 * majority never decides) plus any other valid score. Online only: the server resolves the game
 * once the home and the away confirmation name the same score.
 */
export function ConflictResolver({
  data,
  matchNumber,
  gameNumber,
  mySide,
  homeName,
  awayName,
  onChanged,
}: {
  data: EncounterData;
  matchNumber: number;
  gameNumber: number;
  mySide: TeamSide;
  homeName: string;
  awayName: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const errorText = useErrorText('match.errors');
  const candidates = conflictCandidates(data.entries, matchNumber, gameNumber);
  const team = teamResolution(data.conflictConfirmations, matchNumber, gameNumber, mySide);

  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<GameScore | 'other' | null>(null);
  const [other, setOther] = useState<GameScoreDraft>({ home: null, away: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per intended confirmation: a double tap or a retry after a timeout reuses it.
  const requestId = useRef<string | null>(null);

  const picked: GameScore | null =
    choice === 'other'
      ? other.home !== null && other.away !== null && isValidGameScore(other.home, other.away)
        ? { home: other.home, away: other.away }
        : null
      : choice;
  const alreadyOurs = same(picked, team.ours);

  const pick = (next: GameScore | 'other') => {
    setChoice(next);
    setError(null);
    requestId.current = null;
  };

  const submit = async () => {
    if (!picked || alreadyOurs || !online) return;
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
      setOpen(false);
      setChoice(null);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="resolve">
      {(team.ours || team.theirs) && (
        <ul className="resolve__status" aria-live="polite">
          {team.ours && <li>{t('match.resolve.oursConfirmed', { score: fmt(team.ours) })}</li>}
          {team.status === 'waiting_opponent' && <li className="muted">{t('match.resolve.waitingOpponent')}</li>}
          {team.theirs && (team.status === 'waiting_us' || team.status === 'disagree') && (
            <li>{t('match.resolve.theirsConfirmed', { score: fmt(team.theirs) })}</li>
          )}
          {team.status === 'disagree' && <li className="resolve__disagree">{t('match.resolve.disagree')}</li>}
        </ul>
      )}

      {!open ? (
        <Button variant="secondary" size="sm" className="resolve__open" onClick={() => setOpen(true)}>
          {t('match.resolve.action')}
        </Button>
      ) : (
        <div className="resolve__panel">
          <p className="note">{t('match.resolve.intro')}</p>
          <div className="resolve__options" role="radiogroup" aria-label={t('match.resolve.action')}>
            {candidates.map((c) => (
              <button
                key={fmt(c)}
                type="button"
                role="radio"
                aria-checked={choice !== 'other' && same(choice, c)}
                className={`resolve__option num${choice !== 'other' && same(choice, c) ? ' resolve__option--selected' : ''}`}
                onClick={() => pick(c)}
              >
                {fmt(c)}
              </button>
            ))}
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

          {team.ours && picked && !alreadyOurs && <p className="note">{t('match.resolve.replaces', { score: fmt(team.ours) })}</p>}
          {!online && <p className="note">{t('match.resolve.offline')}</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-stack">
            <Button
              block
              icon={<Check size={18} aria-hidden />}
              onClick={() => void submit()}
              disabled={!picked || alreadyOurs || !online || busy}
            >
              {picked ? t('match.resolve.confirm', { score: fmt(picked) }) : t('match.resolve.action')}
            </Button>
            <Button variant="ghost" block onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
