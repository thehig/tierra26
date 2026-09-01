// A concept explainer page (soup, daughter, flags, the save-pile, …).
//
// The body is authored in docs/bible/concepts/<slug>.md and rendered here — the
// page contributes the chrome (crumb, title, colour) and nothing else. Before
// this, the page showed two lines from the 9-entry keyword registry while a
// 14-page authored corpus sat unread on disk.
import { KEYWORDS, lookupKeyword } from '@tierra26/content/keyword.ts';
import { conceptDoc, fm } from '../doc/docs.ts';
import { DocRenderer } from '../doc/DocRenderer.tsx';
import { categoryVar } from '../design/palette.ts';
import { Link } from '../router/router.tsx';

export function ConceptPage({ slug, dark }: { slug: string; dark: boolean }) {
  const doc = conceptDoc(slug);
  // The keyword registry still owns the inline hover tooltip; it is also the
  // fallback for a concept that has a registry entry but no Bible page yet.
  const entry =
    lookupKeyword(slug, KEYWORDS) ??
    KEYWORDS.find((k) => k.kind === 'concept' && k.link?.kind === 'concept' && k.link.slug === slug);

  if (!doc && !entry) {
    return (
      <div className="page">
        <h1>Concept not found</h1>
        <Link className="btn" to="home">← Home</Link>
      </div>
    );
  }

  const title = fm(doc, 'title') ?? entry?.term ?? slug;

  return (
    <div className="page concept-page">
      <div className="crumb">
        <Link to={{ surface: 'wiki' }}>Instructions</Link> <span>/</span> concept
      </div>
      <h1 className="concept-title" style={{ color: categoryVar('concept') }}>{title}</h1>

      {doc ? (
        // The Bible body opens with its own `# slug` heading; the page has just
        // rendered a styled title, so skip it rather than saying it twice.
        <DocRenderer body={doc.ast.body} dark={dark} skipLeadingHeading />
      ) : (
        <>
          <p className="concept-kid">{entry!.tooltip.kid}</p>
          <p className="concept-more">{entry!.tooltip.more}</p>
        </>
      )}

      <Link className="btn" to={{ surface: 'wiki' }}>Browse the instructions →</Link>
    </div>
  );
}
