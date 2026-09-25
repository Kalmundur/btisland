import { Search } from 'lucide-react';
import { normalizeRoundCode, ROUND_CODE_LENGTH } from '../domain/roundCode';

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="search-field">
      <Search size={18} className="search-field__icon" aria-hidden />
      <input
        type="search"
        className="search-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
    </label>
  );
}

/** Single numeric input styled as a six-digit code field (works with paste and SMS/OTP autofill). */
export function CodeInput({
  value,
  onChange,
  label,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="code-input">
      <span className="field__label">{label}</span>
      <input
        className={`code-input__field num${invalid ? ' code-input__field--invalid' : ''}`}
        value={value}
        onChange={(e) => onChange(normalizeRoundCode(e.target.value))}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={ROUND_CODE_LENGTH + 2}
        placeholder={'•'.repeat(ROUND_CODE_LENGTH)}
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`segmented__item${value === o.value ? ' segmented__item--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
