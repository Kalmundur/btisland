import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/Inputs';
import { Button } from '../../components/Button';
import { savePlayerProfile } from '../../data/playerProfileRepository';
import { EMPTY_PROFILE, SCALE_VALUES, type PlayerProfileDetails, type PlayingHand, type ScaleValue } from '../../domain/playerProfile';
import { markProfileSetupDone } from './profileOnboarding';
import type { UUID } from '../../domain/types';

/**
 * The three optional details. Nothing is pre-selected: a field stays null until the player
 * taps a value (tapping the selected value again clears it), so an untouched control is never
 * stored as "balanced".
 *
 * onboarding: "Vista og halda áfram" + "Sleppa í bili" (skip stores an all-null row).
 * edit:       "Vista" only (leaving the page is the cancel).
 */
export function PlayerProfileForm({
  playerId,
  initial,
  mode,
  onDone,
}: {
  playerId: UUID;
  initial: PlayerProfileDetails | null;
  mode: 'onboarding' | 'edit';
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<PlayerProfileDetails>(initial ?? EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const save = async (details: PlayerProfileDetails, allowOffline: boolean) => {
    setBusy(true);
    setError(false);
    try {
      await savePlayerProfile(playerId, details);
    } catch {
      // Skipping must never trap the player: remember it on this device and move on.
      if (!allowOffline) {
        setError(true);
        setBusy(false);
        return;
      }
    }
    markProfileSetupDone(playerId);
    setBusy(false);
    onDone();
  };

  const hand = value.playingHand ?? '';
  return (
    <div className="profile-form">
      <div className="profile-form__field">
        <span className="field__label" id={`${playerId}-hand`}>
          {t('playerProfile.hand')}
        </span>
        <SegmentedControl<PlayingHand | ''>
          label={t('playerProfile.hand')}
          value={hand}
          options={[
            { value: 'right', label: t('playerProfile.handRight') },
            { value: 'left', label: t('playerProfile.handLeft') },
          ]}
          onChange={(v) => setValue((p) => ({ ...p, playingHand: v === '' || v === p.playingHand ? null : v }))}
        />
      </div>

      <ScaleField
        label={t('playerProfile.style')}
        minLabel={t('playerProfile.styleMin')}
        maxLabel={t('playerProfile.styleMax')}
        levelLabel={(n) => t(`playerProfile.styleLevels.${n}`)}
        value={value.playingStyle}
        onChange={(n) => setValue((p) => ({ ...p, playingStyle: n }))}
      />

      <ScaleField
        label={t('playerProfile.emphasis')}
        minLabel={t('playerProfile.emphasisMin')}
        maxLabel={t('playerProfile.emphasisMax')}
        levelLabel={(n) => t(`playerProfile.emphasisLevels.${n}`)}
        value={value.strokeEmphasis}
        onChange={(n) => setValue((p) => ({ ...p, strokeEmphasis: n }))}
      />

      {error && (
        <p className="form-error" role="alert">
          {t('playerProfile.saveError')}
        </p>
      )}
      <div className="button-stack">
        <Button block onClick={() => void save(value, false)} disabled={busy}>
          {mode === 'onboarding' ? t('playerProfile.saveContinue') : t('common.save')}
        </Button>
        {mode === 'onboarding' && (
          <Button variant="ghost" block onClick={() => void save(EMPTY_PROFILE, true)} disabled={busy}>
            {t('playerProfile.skip')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Five discrete steps between two end labels; nothing selected = unanswered (null). */
function ScaleField({
  label,
  minLabel,
  maxLabel,
  levelLabel,
  value,
  onChange,
}: {
  label: string;
  minLabel: string;
  maxLabel: string;
  levelLabel: (n: ScaleValue) => string;
  value: ScaleValue | null;
  onChange: (n: ScaleValue | null) => void;
}) {
  const labelId = useId();
  return (
    <div className="profile-form__field">
      <span className="field__label" id={labelId}>
        {label}
      </span>
      <div className="scale">
        <span className="scale__end" aria-hidden>
          {minLabel}
        </span>
        <div className="scale__steps" role="radiogroup" aria-labelledby={labelId}>
          {SCALE_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={levelLabel(n)}
              title={levelLabel(n)}
              className={`scale__step${value === n ? ' scale__step--on' : ''}`}
              onClick={() => onChange(value === n ? null : n)}
            >
              <span className="scale__dot" aria-hidden />
            </button>
          ))}
        </div>
        <span className="scale__end scale__end--max" aria-hidden>
          {maxLabel}
        </span>
      </div>
      <p className="scale__value" aria-live="polite">
        {value ? levelLabel(value) : ' '}
      </p>
    </div>
  );
}
