import type { CSSProperties, ReactNode } from 'react';

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
  // One column per boxed figure: the full-width secondary rows must not create extra columns.
  const columns = Math.max(1, items.filter((i) => !i.secondary).length);
  return (
    <dl
      className={variant === 'cards' ? 'stats' : `stats stats--${variant}`}
      style={{ '--stats-cols': columns } as CSSProperties}
    >
      {items.map((i) => (
        <div key={i.label} className={`stats__item${i.secondary ? ' stats__item--secondary' : ''}`}>
          <dt className="stats__label">{i.label}</dt>
          <dd className="stats__value num">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
