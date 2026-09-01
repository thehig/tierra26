// Renders a prose block's spans: plain text, a colored + hoverable keyword card, or an
// instruction link that routes to the wiki. Colors/tooltips come from the reader model.
import type { ProseSpan } from '@tierra26/ui/reader.ts';
import type { KeywordCategory } from '../design/palette.ts';
import { Link } from '../router/router.tsx';
// The [01] lesson reader's keyword treatment. Documents render {term} as a
// <Chip> instead (doc/MiniMark.tsx); this is the remaining System A path.
import { KeywordCard, conceptSlug } from '../doc/KeywordCard.tsx';

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
