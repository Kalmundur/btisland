import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

export function Section({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `section ${className}` : 'section'}>
      {(title || action) && (
        <div className="section__head">
          {title && <h2 className="section__title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list">{children}</ul>;
}

interface ListRowProps {
  to?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  selected?: boolean;
}

/** One tappable (or static) row with a thin divider – the basic building block of lists. */
export function ListRow({ to, onClick, leading, title, subtitle, trailing, chevron, selected }: ListRowProps) {
  const body = (
    <>
      {leading && <span className="list-row__leading">{leading}</span>}
      <span className="list-row__main">
        <span className="list-row__title">{title}</span>
        {subtitle && <span className="list-row__subtitle">{subtitle}</span>}
      </span>
      {trailing && <span className="list-row__trailing">{trailing}</span>}
      {chevron && <ChevronRight className="list-row__chevron" size={18} aria-hidden />}
    </>
  );
  const className = `list-row${to || onClick ? ' list-row--interactive' : ''}${selected ? ' list-row--selected' : ''}`;

  return (
    <li>
      {to ? (
        <Link to={to} className={className}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" className={className} onClick={onClick} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
