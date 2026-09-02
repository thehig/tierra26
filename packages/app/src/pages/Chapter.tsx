// Renders one brick-by-brick chapter.
//
// The page is now chrome only: the hero, the document, and the next link. The
// scroll explainer, the demo creature and the "your turn" challenge all come out
// of `docs/lessons/<n>-<id>.md` through the doc renderer, so changing a lesson is
// editing markdown rather than editing this app.
import { DocRenderer } from '../doc/DocRenderer.tsx';
import { EditPageButton } from '../doc/EditPageButton.tsx';
import { chapterById, nextChapter } from '../learn/lessons.ts';
import { usePrefs } from '../store/prefs.tsx';
import { Link } from '../router/router.tsx';
import { WipMark } from '../learn/WipMark.tsx';

export function ChapterPage({ id, dark }: { id: string; dark: boolean }) {
  const chapter = chapterById(id);
  const { completeLesson } = usePrefs();
  const next = chapter ? nextChapter(chapter.id) : undefined;

  if (!chapter) {
    return (
      <div className="page"><h1>Chapter not found</h1><Link className="btn" to="home">← Home</Link></div>
    );
  }

  if (!chapter.ready) {
    return (
      <div className="page chapter coming">
        <div className="eyebrow">Chapter {chapter.no}</div>
        <h1><WipMark />{chapter.title}</h1>
        <p className="anatomy-lede">We’re building this chapter next — it’ll teach the next brick. Check back soon!</p>
        <Link className="btn" to="home">← Back to the map</Link>
      </div>
    );
  }

  // The "zoomed-out" big-world chapters (the ancestor) get a wider layout so the
  // byte-level genome (one row per cell) has room to breathe.
  const wide = (chapter.soup ?? 0) > 49;

  return (
    <div className={`page anatomy chapter${wide ? ' wide' : ''}`}>
      <header className="anatomy-hero">
        <div className="eyebrow">
          Chapter {chapter.no} · {chapter.phase}
          <EditPageButton doc={chapter.doc} dark={dark} />
        </div>
        <h1>{chapter.title}</h1>
        <p className="anatomy-lede">{chapter.lede}</p>
      </header>

      <DocRenderer
        body={chapter.doc.ast.body}
        dark={dark}
        onGoalMet={() => completeLesson(chapter.id)}
      />

      <div className="anatomy-next">
        {next
          ? <Link className="btn primary" to={{ surface: 'learn', chapterId: next.id }} onNavigate={() => completeLesson(chapter.id)}>Next: {next.title} →</Link>
          : <Link className="btn" to="home" onNavigate={() => completeLesson(chapter.id)}>Finish · back to the map</Link>}
      </div>
    </div>
  );
}
