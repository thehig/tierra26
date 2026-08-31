// Renders a prose block's spans: plain text, a colored + hoverable keyword card, or an
// instruction link that routes to the wiki. Colors/tooltips come from the reader model.
import type { KeyboardEvent } from 'react';
import type { ProseSpan } from '@tierra26/ui/reader.ts';
import { KEYWORDS, lookupKeyword } from '@tierra26/content/keyword.ts';
import { categoryVar, type KeywordCategory } from '../design/palette.ts';
import { Link } from '../router/router.tsx';

// The concept-explainer slug for a keyword term, if it has one (concept nouns only).
function conceptSlug(term: string): string | undefined {
  const e = lookupKeyword(term, KEYWORDS);
  return e?.link?.kind === 'concept' ? e.link.slug : undefined;
}

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
              slug={conceptSlug(sp.term)}
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
// Keyboard-focusable and Escape-dismissable (READER-010). Concept nouns link to their explainer.
function KeywordCard({ term, color, kid, more, slug }: { term: string; color: KeywordCategory; kid: string; more?: string; slug?: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape') e.currentTarget.blur();
  };
  return (
    <span className="kw" style={{ color: categoryVar(color) }} tabIndex={0} onKeyDown={onKeyDown}>
      {term}
      <span className="kw-card" role="tooltip">
        <span className="kw-card-kid">{kid}</span>
        {more && <span className="kw-card-more">{more}</span>}
        {slug && <Link className="kw-card-more-link" to={{ surface: 'concept', slug }}>read more →</Link>}
      </span>
    </span>
  );
}
