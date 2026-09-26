import type { ReactNode } from 'react';

/**
 * Label/value grid for summary numbers. `cards` (default) boxes each figure; `compact` is a
 * lighter, lower box for a few headline figures; `row` puts all figures in one evenly spaced
 * row between thin dividers, with no boxes.
 */
export function Stats({
  items,
  variant = 'cards',
}: {
  items: Array<{ label: string; value: ReactNode; secondary?: boolean }>;
  variant?: 'cards' | 'compact' | 'row';
}) {
  return (
    <dl className={variant === 'cards' ? 'stats' : `stats stats--${variant}`}>
      {items.map((i) => (
        <div key={i.label} className={`stats__item${i.secondary ? ' stats__item--secondary' : ''}`}>
          <dt className="stats__label">{i.label}</dt>
          <dd className="stats__value num">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
