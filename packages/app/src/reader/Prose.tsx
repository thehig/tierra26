// Renders a prose block's spans: plain text, a colored + hoverable keyword, or an
// instruction link that routes to the wiki. Colors/tooltips come from the reader model.
import type { ProseSpan } from '@tierra26/ui/reader.ts';
import { categoryVar, type KeywordCategory } from '../design/palette.ts';
import { Link } from '../router/router.tsx';

export function Prose({ spans }: { spans: ProseSpan[] }) {
  return (
    <p className="prose">
      {spans.map((sp, i) => {
        if (sp.kind === 'text') return <span key={i}>{sp.text}</span>;
        if (sp.kind === 'keyword') {
          const title = sp.tooltip.more ? `${sp.tooltip.kid} — ${sp.tooltip.more}` : sp.tooltip.kid;
          return (
            <span key={i} className="kw" style={{ color: categoryVar(sp.color as KeywordCategory) }} title={title}>
              {sp.term}
            </span>
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
