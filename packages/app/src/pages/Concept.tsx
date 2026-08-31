// A concept explainer page (soup, daughter, parasite, …). Renders the keyword registry entry's
// kid + deeper "more" line — the "read more" target behind a concept keyword.
import { KEYWORDS } from '@tierra26/content/keyword.ts';
import { Link } from '../router/router.tsx';

export function ConceptPage({ slug }: { slug: string }) {
  const entry = KEYWORDS.find(
    (k) => k.kind === 'concept' && ((k.link?.kind === 'concept' && k.link.slug === slug) || k.term === slug),
  );
  if (!entry) {
    return (
      <div className="page">
        <h1>Concept not found</h1>
        <Link className="btn" to="home">← Home</Link>
      </div>
    );
  }
  return (
    <div className="page concept-page">
      <div className="crumb"><Link to={{ surface: 'wiki' }}>Instructions</Link> <span>/</span> concept</div>
      <h1 className="concept-title" style={{ color: 'var(--kw-concept)' }}>{entry.term}</h1>
      <p className="concept-kid">{entry.tooltip.kid}</p>
      <p className="concept-more">{entry.tooltip.more}</p>
      <Link className="btn" to={{ surface: 'wiki' }}>Browse the instructions →</Link>
    </div>
  );
}
