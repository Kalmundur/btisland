import { useRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_DIGITS = 2;

/** Game points: null = not entered yet. */
export interface GameScoreDraft {
  home: number | null;
  away: number | null;
}

interface Side {
  name: string;
  letter: string | null;
}

/**
 * Two large numeric fields – tap and type the points with the phone's number keyboard.
 * "Next" on the first field moves to the second; "Done" on the second submits.
 */
export function ScoreInput({
  home,
  away,
  value,
  onChange,
  onSubmit,
}: {
  home: Side;
  away: Side;
  value: GameScoreDraft;
  onChange: (value: GameScoreDraft) => void;
  onSubmit: () => void;
}) {
  const awayRef = useRef<HTMLInputElement>(null);
  return (
    <div className="score-input">
      <Field side={home} value={value.home} onChange={(v) => onChange({ ...value, home: v })} onEnter={() => awayRef.current?.focus()} enterHint="next" />
      <Field side={away} value={value.away} onChange={(v) => onChange({ ...value, away: v })} onEnter={onSubmit} enterHint="done" inputRef={awayRef} />
    </div>
  );
}

function Field({
  side,
  value,
  onChange,
  onEnter,
  enterHint,
  inputRef,
}: {
  side: Side;
  value: number | null;
  onChange: (value: number | null) => void;
  onEnter: () => void;
  enterHint: 'next' | 'done';
  inputRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  return (
    <label className="score-input__side">
      <span className="score-input__who">
        {side.letter && <span className="score-input__letter">{side.letter}</span>}
        <span className="score-input__name">{side.name}</span>
      </span>
      <input
        ref={inputRef}
        className="score-input__field num"
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS);
          onChange(digits === '' ? null : Number(digits));
        }}
        // Every tap selects the whole value, so typing always replaces it (also when already focused).
        onFocus={(e) => e.target.select()}
        onClick={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint={enterHint}
        placeholder="0"
        aria-label={t('match.typeScore', { name: side.name })}
      />
    </label>
  );
}
