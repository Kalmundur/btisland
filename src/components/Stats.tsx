import type { ReactNode } from 'react';

/** Compact label/value grid for summary numbers. */
export function Stats({ items }: { items: Array<{ label: string; value: ReactNode; secondary?: boolean }> }) {
  return (
    <dl className="stats">
      {items.map((i) => (
        <div key={i.label} className={`stats__item${i.secondary ? ' stats__item--secondary' : ''}`}>
          <dt className="stats__label">{i.label}</dt>
          <dd className="stats__value num">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
