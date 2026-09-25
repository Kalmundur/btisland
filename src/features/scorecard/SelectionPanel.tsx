import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '../../components/Button';
import { selectionProgress } from '../../domain/confirmation';
import { useErrorText } from '../../hooks/useErrorText';
import type { PlayerListItem, TeamSelection } from '../../domain/types';

/**
 * Own-team selection with two-person confirmation – used for the singles lineup (A/B/C or
 * X/Y/Z) and the doubles pair (1/2). Proposing/editing = confirmation #1 of a new version;
 * a different teammate confirms the exact version to lock it.
 */
export function SelectionPanel({
  title,
  slots,
  roster,
  selection,
  current,
  myPlayerId,
  names,
  lockedLabel,
  validate,
  onPropose,
  onConfirm,
}: {
  title: string;
  slots: readonly string[];
  roster: PlayerListItem[];
  selection: TeamSelection | undefined;
  /** Current assignment per slot of the selection (own team can always see it). */
  current: Record<string, string | undefined>;
  myPlayerId: string | null;
  names: Record<string, string>;
  lockedLabel: string;
  validate: (draft: Record<string, string | undefined>) => string | null;
  onPropose: (draft: Record<string, string>) => Promise<void>;
  onConfirm: (version: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText('selection.errors');
  const progress = selectionProgress(selection, myPlayerId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(Object.fromEntries(slots.map((s) => [s, current[s]])));
    setError(null);
    setEditing(true);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const problem = validate(draft);
    if (problem) {
      setError(t(`selection.errors.${problem}`, { defaultValue: t('selection.errors.generic') }));
      return;
    }
    void run(() => onPropose(draft as Record<string, string>));
  };

  const name = (id: string | undefined) => (id ? (names[id] ?? roster.find((p) => p.id === id)?.fullName ?? '…') : '—');
  const showEditor = editing || progress.stage === 'missing';

  return (
    <section className="selection">
      <div className="selection__head">
        <h2 className="selection__title">{title}</h2>
        {selection && !showEditor && (
          <span className={`selection__badge${progress.stage === 'locked' ? ' selection__badge--locked' : ''}`}>
            {progress.stage === 'locked' ? (
              <>
                <Lock size={12} aria-hidden /> {lockedLabel}
              </>
            ) : (
              t('selection.progress', { count: progress.count })
            )}
          </span>
        )}
      </div>

      {showEditor ? (
        <div className="selection__editor">
          {slots.map((s) => (
            <label key={s} className="selection__slot">
              <span className="selection__letter">{s}</span>
              <select
                className="field__control"
                value={draft[s] ?? ''}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, [s]: e.target.value || undefined }));
                  setError(null);
                }}
                aria-label={`${s} – ${t('selection.choosePlayer')}`}
              >
                <option value="">{t('selection.choosePlayer')}</option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-stack">
            <Button block onClick={submit} disabled={busy}>
              {selection ? t('selection.saveChange') : t('selection.submit')}
            </Button>
            {editing && (
              <Button variant="ghost" block onClick={() => setEditing(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <ul className="selection__list">
            {slots.map((s) => (
              <li key={s} className="selection__row">
                <span className="selection__letter">{s}</span>
                <span className="selection__name">{name(current[s])}</span>
              </li>
            ))}
          </ul>
          {progress.stage === 'pending' && (
            <>
              <p className="note">
                {progress.iConfirmed ? (
                  <>
                    <CheckCircle2 size={14} className="accent" aria-hidden /> {t('selection.youConfirmed')}
                  </>
                ) : (
                  t('selection.reviewHint')
                )}
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="button-stack">
                {progress.canConfirm && selection && (
                  <Button block icon={<Check size={18} aria-hidden />} onClick={() => void run(() => onConfirm(selection.version))} disabled={busy}>
                    {t('selection.confirm')}
                  </Button>
                )}
                <Button variant="secondary" block onClick={startEdit} disabled={busy}>
                  {t('selection.edit')}
                </Button>
              </div>
              {selection && <p className="selection__version">{t('selection.version', { version: selection.version })}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** One-line status of the opponent's (hidden) selection. */
export function OpponentSelectionStatus({
  label,
  selection,
  missingLabel,
  lockedLabel,
  hiddenNote,
}: {
  label: string;
  selection: TeamSelection | undefined;
  missingLabel: string;
  lockedLabel: string;
  hiddenNote: string;
}) {
  const { t } = useTranslation();
  const progress = selectionProgress(selection, null);
  const text =
    progress.stage === 'locked'
      ? lockedLabel
      : progress.stage === 'pending'
        ? t('selection.opponentProgress', { count: progress.count })
        : missingLabel;
  return (
    <div className="opponent-status">
      <div className="opponent-status__row">
        <span className="opponent-status__label">{label}</span>
        <span className={`opponent-status__value${progress.stage === 'locked' ? ' opponent-status__value--locked' : ''}`}>{text}</span>
      </div>
      {hiddenNote && <p className="note">{hiddenNote}</p>}
    </div>
  );
}
