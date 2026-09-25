import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';

const MAX_POINTS = 99;

/** One side's points: [−] value [+]. Tap the value to type it with the numeric keyboard. */
function SideControl({
  name,
  letter,
  value,
  onChange,
}: {
  name: string;
  letter: string | null;
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typing) inputRef.current?.select();
  }, [typing]);

  const commit = () => {
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n)) onChange(Math.max(0, Math.min(MAX_POINTS, n)));
    setTyping(false);
  };

  return (
    <div className="stepper__side">
      <span className="stepper__who">
        {letter && <span className="stepper__letter">{letter}</span>}
        <span className="stepper__name">{name}</span>
      </span>
      {typing ? (
        <input
          ref={inputRef}
          className="stepper__input num"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setTyping(false);
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={t('match.typeScore', { name })}
        />
      ) : (
        <button
          type="button"
          className="stepper__value num"
          onClick={() => {
            setText(String(value));
            setTyping(true);
          }}
          aria-label={t('match.typeScore', { name })}
        >
          {value}
        </button>
      )}
      <div className="stepper__buttons">
        <button
          type="button"
          className="stepper__btn"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={t('match.decrease', { name })}
        >
          <Minus size={26} aria-hidden />
        </button>
        <button
          type="button"
          className="stepper__btn"
          onClick={() => onChange(Math.min(MAX_POINTS, value + 1))}
          aria-label={t('match.increase', { name })}
        >
          <Plus size={26} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ScoreStepper({
  home,
  away,
  onChange,
}: {
  home: { name: string; letter: string | null; value: number };
  away: { name: string; letter: string | null; value: number };
  onChange: (home: number, away: number) => void;
}) {
  return (
    <div className="stepper">
      <SideControl name={home.name} letter={home.letter} value={home.value} onChange={(v) => onChange(v, away.value)} />
      <SideControl name={away.name} letter={away.letter} value={away.value} onChange={(v) => onChange(home.value, v)} />
    </div>
  );
}
