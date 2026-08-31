// Renders a prose block's spans: plain text, a colored + hoverable keyword card, or an
// instruction link that routes to the wiki. Colors/tooltips come from the reader model.
import type { KeyboardEvent } from 'react';
import type { ProseSpan } from '@tierra26/ui/reader.ts';
import { categoryVar, type KeywordCategory } from '../design/palette.ts';
import { Link } from '../router/router.tsx';

export function Prose({ spans }: { spans: ProseSpan[] }) {
  return (
    <p className="prose">
      {spans.map((sp, i) => {
        if (sp.kind === 'text') return <span key={i}>{sp.text}</span>;
        if (sp.kind === 'keyword') {
          return (
            <KeywordCard
              key={i}
              term={sp.term}
              color={sp.color as KeywordCategory}
              kid={sp.tooltip.kid}
              more={sp.tooltip.more}
            />
          );
        }
        return (
          <Link key={i} to={{ surface: 'wiki', verb: sp.verb }} className="instr-link">
            {sp.verb}
          </Link>
        );
      })}
    </p>
  );
}

// A colored keyword with a progressive hover/focus card (kid line + optional machine "more").
// Keyboard-focusable and Escape-dismissable (READER-010); the card shows via :hover/:focus-within.
function KeywordCard({ term, color, kid, more }: { term: string; color: KeywordCategory; kid: string; more?: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape') e.currentTarget.blur();
  };
  return (
    <span className="kw" style={{ color: categoryVar(color) }} tabIndex={0} onKeyDown={onKeyDown}>
      {term}
      <span className="kw-card" role="tooltip">
        <span className="kw-card-kid">{kid}</span>
        {more && <span className="kw-card-more">{more}</span>}
      </span>
    </span>
  );
}
