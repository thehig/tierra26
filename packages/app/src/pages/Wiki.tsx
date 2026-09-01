// The instruction wiki: an index grouped by color role, and a per-verb page.
//
// The per-verb body is the Bible — docs/bible/opcodes/<mnemonic>.md — rendered
// through the doc pipeline. The page keeps only what is presentation: the
// language-mode-aware title, the "try it" playgrounds, and the intro-lesson
// link. Facts about the instruction come from the document.
import { allVerbs, entry, entryOfMnemonic } from '@tierra26/genescript/vocab.ts';
import { pageOf } from '@tierra26/content/instrpage.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { toInstructionPageModel } from '@tierra26/ui/reader.ts';
import { LazyPlayground } from '../reader/LazyPlayground.tsx';
import { DocRenderer } from '../doc/DocRenderer.tsx';
import { opcodeDoc, fm } from '../doc/docs.ts';
import { Chip } from '../doc/Chip.tsx';
import { useLanguageMode } from '../design/languageMode.tsx';
import { simpleName } from '../design/bindings.ts';
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
  const advanced = useLanguageMode() === 'advanced';
  // The route may carry either spelling. Bible pages cross-link by MNEMONIC
  // (`[mal](mal.md)`) while the wiki index links by gene name (`make-space`),
  // and both have to land here.
  const v = entry(verb) ?? entryOfMnemonic(verb);
  const doc = opcodeDoc(verb);
  const page = v ? pageOf(v.verb) : undefined;

  if (!v || (!doc && !page)) {
    return (
      <div className="page">
        <h1>Unknown instruction</h1>
        <Link className="btn" to={{ surface: 'wiki' }}>← All instructions</Link>
      </div>
    );
  }

  // INSTRPAGE still owns what the Bible does not carry: the editable "try it"
  // scenarios, and the `targets` animation data OpcodeTooltip renders.
  const m = page ? toInstructionPageModel(page) : undefined;
  const introTitle = m ? CURRICULUM.lessons[m.introLesson]?.title : undefined;

  const display = advanced ? v.mnemonic : simpleName(v.verb);
  const other = advanced ? simpleName(v.verb) : v.mnemonic;

  return (
    <div className="page wiki-page">
      <div className="crumb"><Link to={{ surface: 'wiki' }}>Instructions</Link> <span>/</span> {display}</div>

      <h1 className="verb-title">
        <Chip opcode={v.mnemonic} />
      </h1>
      <div className="verb-machine">
        <span className="tagpill">{other}</span> <code>{v.machine}</code>
        {fm(doc, 'can_error') === 'true' && <span className="tagpill">can raise E</span>}
      </div>

      {doc ? (
        <DocRenderer body={doc.ast.body} dark={dark} skipLeadingHeading />
      ) : (
        <p className="verb-kid">{v.kid}</p>
      )}

      {m && m.scenarios.length > 0 && (
        <>
          <h3>Try it</h3>
          {m.scenarios.map((sc) => (
            <LazyPlayground key={sc.id} config={sc.config} dark={dark} prompt={sc.prompt} />
          ))}
        </>
      )}

      {introTitle && m && (
        <div className="verb-foot">
          <div className="introlesson">
            Introduced in <Link to={{ surface: 'lesson', lessonId: m.introLesson }}>{introTitle}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
