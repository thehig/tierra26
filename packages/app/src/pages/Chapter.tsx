// Renders one brick-by-brick chapter: a short scroll-driven explainer over a steppable demo
// creature, then the "your turn" micro-challenge. Reuses the anatomy stage + micro-engine.
import { entry } from '@tierra26/genescript/vocab.ts';
import { Scrolly, type ScrollyStep } from '../anatomy/Scrolly.tsx';
import { EntityDiagram } from '../anatomy/EntityDiagram.tsx';
import { useMicroEngine } from '../anatomy/useMicroEngine.ts';
import { MicroSandbox } from '../learn/MicroSandbox.tsx';
import { chapterById, nextChapter } from '../learn/chapters.ts';
import { usePrefs } from '../store/prefs.tsx';
import { Link } from '../router/router.tsx';

// Inline rich text: `verb` → colored code, *word* → emphasis.
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`')) {
          const t = p.slice(1, -1);
          const cat = entry(t)?.category;
          return <code key={i} className="rt-code" style={cat ? { color: `var(--kw-${cat})` } : undefined}>{t}</code>;
        }
        if (p.startsWith('*') && p.endsWith('*')) return <strong key={i}>{p.slice(1, -1)}</strong>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function ChapterPage({ id }: { id: string }) {
  const chapter = chapterById(id);
  const { completeLesson } = usePrefs();
  // Hooks must run unconditionally — the demo engine gets '' when there's no chapter/demo.
  const demo = useMicroEngine(chapter?.demo ?? '');
  const next = chapter ? nextChapter(chapter.id) : undefined;

  if (!chapter) {
    return <div className="page"><h1>Chapter not found</h1><Link className="btn" to="home">← Home</Link></div>;
  }
  if (!chapter.ready) {
    return (
      <div className="page chapter coming">
        <div className="eyebrow">Chapter {chapter.no}</div>
        <h1>{chapter.title}</h1>
        <p className="anatomy-lede">We’re building this chapter next — it’ll teach the next brick. Check back soon!</p>
        <Link className="btn" to="home">← Back to the map</Link>
      </div>
    );
  }

  const steps: ScrollyStep[] = chapter.waypoints.map((w, i) => ({
    id: chapter.id + i,
    content: (<><h2><RichText text={w.title} /></h2><p><RichText text={w.body} /></p></>),
  }));

  return (
    <div className="page anatomy chapter">
      <header className="anatomy-hero">
        <div className="eyebrow">Chapter {chapter.no} · {chapter.phase}</div>
        <h1>{chapter.title}</h1>
        <p className="anatomy-lede">{chapter.lede}</p>
      </header>

      <Scrolly
        steps={steps}
        stage={(active) => (
          <EntityDiagram
            state={demo.state}
            focus={active === null ? 'whole' : (chapter.waypoints[active]?.focus ?? 'whole')}
            onStep={demo.step}
            onReset={demo.reset}
            onRun={demo.run}
            onPause={demo.pause}
            running={demo.running}
            steps={demo.steps}
          />
        )}
      />

      {chapter.challenge && (
        <MicroSandbox challenge={chapter.challenge} onSolved={() => completeLesson(chapter.id)} />
      )}

      <div className="anatomy-next">
        {next
          ? <Link className="btn primary" to={{ surface: 'learn', chapterId: next.id }} onNavigate={() => completeLesson(chapter.id)}>Next: {next.title} →</Link>
          : <Link className="btn" to="home" onNavigate={() => completeLesson(chapter.id)}>Finish · back to the map</Link>}
      </div>
    </div>
  );
}
