// A colored {term} with a progressive hover/focus card (kid line + the deeper
// "more" line), linking on to its concept page.
//
// Lifted out of reader/Prose.tsx so the doc renderer and the lesson reader share
// one implementation — the keyboard-focusable, Escape-dismissable behaviour
// (READER-010) is easy to get subtly wrong twice.
import type { KeyboardEvent } from 'react';
import { KEYWORDS, lookupKeyword } from '@tierra26/content/keyword.ts';
import { categoryVar, type KeywordCategory } from '../design/palette.ts';
import { Link } from '../router/router.tsx';

/** The concept-explainer slug for a term, if it has one (concept nouns only). */
export function conceptSlug(term: string): string | undefined {
  const e = lookupKeyword(term, KEYWORDS);
  return e?.link?.kind === 'concept' ? e.link.slug : undefined;
}

export interface KeywordCardProps {
  term: string;
  /** Supplied by the lesson reader, which has already resolved the render model;
   *  omitted by the doc renderer, which resolves straight from the registry. */
  color?: KeywordCategory;
  kid?: string;
  more?: string;
  slug?: string;
}

export function KeywordCard({ term, color, kid, more, slug }: KeywordCardProps) {
  const e = lookupKeyword(term, KEYWORDS);
  const cat = color ?? ((e?.category ?? 'concept') as KeywordCategory);
  const kidLine = kid ?? e?.tooltip.kid ?? term;
  const moreLine = more ?? e?.tooltip.more;
  const to = slug ?? conceptSlug(term);

  const onKeyDown = (ev: KeyboardEvent<HTMLSpanElement>) => {
    if (ev.key === 'Escape') ev.currentTarget.blur();
  };

  return (
    <span className="kw" style={{ color: categoryVar(cat) }} tabIndex={0} onKeyDown={onKeyDown}>
      {term}
      <span className="kw-card" role="tooltip">
        <span className="kw-card-kid">{kidLine}</span>
        {moreLine && <span className="kw-card-more">{moreLine}</span>}
        {to && (
          <Link className="kw-card-more-link" to={{ surface: 'concept', slug: to }}>
            read more →
          </Link>
        )}
      </span>
    </span>
  );
}
