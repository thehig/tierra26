// The instruction wiki: an index grouped by color role, and a per-verb page.
import { allVerbs, entry } from '@tierra26/genescript/vocab.ts';
import { pageOf } from '@tierra26/content/instrpage.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { toInstructionPageModel } from '@tierra26/ui/reader.ts';
import { LazyPlayground } from '../reader/LazyPlayground.tsx';
import { Link } from '../router/router.tsx';

const CATEGORY_ORDER = ['control', 'register', 'action', 'marker'] as const;

export function WikiIndex() {
  return (
    <div className="page wiki-index">
      <h1>Instructions</h1>
      <p className="wiki-intro">Every word your creatures can run. Colors group them by what they do.</p>
      {CATEGORY_ORDER.map((cat) => {
        const verbs = allVerbs().filter((v) => v.category === cat);
        return (
          <section key={cat} className="wiki-cat">
            <h2 className={`cm-kw-${cat}`}>{cat}</h2>
            <div className="verb-grid">
              {verbs.map((v) => (
                <Link key={v.verb} className={`verb-chip cm-kw-${cat}`} to={{ surface: 'wiki', verb: v.verb }}>{v.verb}</Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function WikiPage({ verb, dark }: { verb: string; dark: boolean }) {
  const page = pageOf(verb);
  if (!page) {
    return (
      <div className="page">
        <h1>Unknown instruction</h1>
        <Link className="btn" to={{ surface: 'wiki' }}>← All instructions</Link>
      </div>
    );
  }
  const m = toInstructionPageModel(page);
  const cat = entry(verb)?.category ?? 'concept';
  const introTitle = CURRICULUM.lessons[m.introLesson]?.title;

  return (
    <div className="page wiki-page">
      <div className="crumb"><Link to={{ surface: 'wiki' }}>Instructions</Link> <span>/</span> {m.verb}</div>
      <h1 className={`cm-kw-${cat} verb-title`}>{m.verb}</h1>
      <p className="verb-kid">{m.kid}</p>
      <div className="verb-machine"><span className="tagpill">{m.mnemonic}</span> <code>{m.machine}</code></div>
      <p className="verb-anim">{m.animation.summary}</p>

      <h3>Try it</h3>
      {m.scenarios.map((sc) => (
        <LazyPlayground key={sc.id} config={sc.config} dark={dark} prompt={sc.prompt} />
      ))}

      {m.commonMistakes.length > 0 && (
        <>
          <h3>Watch out for</h3>
          <ul className="mistakes">{m.commonMistakes.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}

      <div className="verb-foot">
        {m.seeAlso.length > 0 && (
          <div className="seealso">
            See also: {m.seeAlso.map((s, i) => (
              <span key={s.verb}>{i > 0 ? ', ' : ''}<Link to={{ surface: 'wiki', verb: s.verb }}>{s.verb}</Link></span>
            ))}
          </div>
        )}
        {introTitle && (
          <div className="introlesson">
            Introduced in <Link to={{ surface: 'lesson', lessonId: m.introLesson }}>{introTitle}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
