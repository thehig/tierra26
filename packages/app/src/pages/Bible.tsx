// THE BIBLE — the reference surface: every instruction and every concept.
//
// The index is BUILT FROM THE CORPUS, never from a list kept here. It walks the
// loaded documents (docs/bible/opcodes/*.md and docs/bible/concepts/*.md) and
// takes each entry's glyph, colour role, name and one-line gloss out of that
// page's own frontmatter and Simple section. Add a Bible page and it appears
// here; rename a gene or change an emoji in frontmatter and this page follows.
// There is nothing to remember to update.
//
// That is safe as the source because the corpus test pins the Bible as a
// BIJECTION with the engine's instruction dictionary — docs-driven and
// engine-driven are the same set, and CI fails if they ever diverge.
//
// The per-instruction page below keeps only what is presentation: the
// language-mode-aware title and the intro-lesson link. EVERYTHING a reader
// reads — including the runnable `## Try it` stage — comes from the document,
// so there is one place to author an instruction and one place to fix it.
import type { LoadedDoc } from '@tierra26/content/docload.ts';
import { entry, entryOfMnemonic } from '@tierra26/genescript/vocab.ts';
import { chapterById, introChapterOf } from '../learn/lessons.ts';
import { DocRenderer } from '../doc/DocRenderer.tsx';
import { conceptDocs, opcodeDocs, opcodeDoc, fm, glossOf } from '../doc/docs.ts';
import { Chip } from '../doc/Chip.tsx';
import { useLanguageMode } from '../design/languageMode.tsx';
import { simpleName } from '../design/bindings.ts';
import { Link } from '../router/router.tsx';
import type { AppRoute } from '../router/router.tsx';

// The colour roles, in reading order. This is a PREFERENCE, not a filter: any
// category the corpus turns up that is not listed here is appended rather than
// dropped, so a new colour role cannot silently hide a page.
const CATEGORY_ORDER = ['control', 'register', 'action', 'marker', 'value', 'concept'] as const;

interface Entry {
  key: string;
  label: string; // what the reader sees
  alt?: string; // the other spelling of an instruction (mnemonic <-> gene)
  emoji: string;
  gloss: string;
  category: string;
  to: AppRoute;
}

/** Group entries by their declared category, preferred roles first and anything
 *  else the corpus declared after them. */
function byCategory(entries: readonly Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = groups.get(e.category);
    if (list) list.push(e);
    else groups.set(e.category, [e]);
  }
  const preferred = CATEGORY_ORDER.filter((c) => groups.has(c));
  const rest = [...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c as never)).sort();
  return [...preferred, ...rest].map((c) => [c, groups.get(c)!]);
}

function opcodeEntries(advanced: boolean): Entry[] {
  return opcodeDocs.map((d: LoadedDoc): Entry => {
    // The mnemonic is the engine's immutable identity; `name` is only what a
    // learner reads, so the language toggle chooses between them.
    const mnemonic = fm(d, 'mnemonic') ?? d.slug;
    const name = fm(d, 'name') ?? mnemonic;
    return {
      key: mnemonic,
      label: advanced ? mnemonic : name,
      alt: advanced ? name : mnemonic,
      emoji: fm(d, 'emoji') ?? '⬛',
      gloss: glossOf(d),
      category: fm(d, 'category') ?? 'concept',
      to: { surface: 'bible', verb: mnemonic },
    };
  });
}

function conceptEntries(): Entry[] {
  return conceptDocs.map(
    (d: LoadedDoc): Entry => ({
      key: d.slug,
      label: d.slug,
      emoji: fm(d, 'emoji') ?? '💠',
      gloss: glossOf(d),
      category: fm(d, 'category') ?? 'concept',
      to: { surface: 'concept', slug: d.slug },
    }),
  );
}

function Shelf({ entries }: { entries: readonly Entry[] }) {
  return (
    <>
      {byCategory(entries).map(([category, items]) => (
        <section key={category} className="bible-cat">
          <h3 className={`bible-cat-name cm-kw-${category}`}>
            {category}
            <span className="bible-count">{items.length}</span>
          </h3>
          <div className="bible-grid">
            {/* The colour role comes from the page's own frontmatter. An unlisted
                role has no cm-kw class, so the card inherits the default ink
                rather than disappearing. */}
            {items.map((e) => (
              <Link key={e.key} to={e.to} className={`bible-card cm-kw-${e.category}`}>
                <span className="bible-card-head">
                  <span className="bible-emoji" aria-hidden="true">
                    {e.emoji}
                  </span>
                  <span className="bible-name">{e.label}</span>
                  {e.alt && <span className="bible-alt">{e.alt}</span>}
                </span>
                <span className="bible-gloss">{e.gloss}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function BibleIndex() {
  const advanced = useLanguageMode() === 'advanced';
  const opcodes = opcodeEntries(advanced);
  const concepts = conceptEntries();

  return (
    <div className="page bible-index">
      <h1>The Bible</h1>
      <p className="bible-intro">
        Everything the machine can do, and every idea behind it — {opcodes.length} instructions and{' '}
        {concepts.length} concepts. Colours group them by what they do. Every page here is the same
        one a hover card shows you mid-lesson.
      </p>

      <h2 className="bible-shelf">Instructions</h2>
      <Shelf entries={opcodes} />

      <h2 className="bible-shelf">Concepts</h2>
      <Shelf entries={concepts} />
    </div>
  );
}

export function OpcodePage({ verb, dark }: { verb: string; dark: boolean }) {
  const advanced = useLanguageMode() === 'advanced';
  // The route may carry either spelling. Bible pages cross-link by MNEMONIC
  // (`[mal](mal.md)`) while an index card links by mnemonic too, but a lesson's
  // prose can link by gene name (`make-space`) — both have to land here.
  const v = entry(verb) ?? entryOfMnemonic(verb);
  const doc = opcodeDoc(verb);

  if (!v || !doc) {
    return (
      <div className="page">
        <h1>Unknown instruction</h1>
        <Link className="btn" to={{ surface: 'bible' }}>
          ← The Bible
        </Link>
      </div>
    );
  }

  // Derived from the documents: the first chapter that NAMES this instruction.
  // Undefined for one no chapter teaches yet, and then the footer is simply not
  // rendered — better than linking a learner at a page that never mentions it.
  const introId = introChapterOf(v.verb);
  const intro = introId ? chapterById(introId) : undefined;

  const display = advanced ? v.mnemonic : simpleName(v.verb);
  const other = advanced ? simpleName(v.verb) : v.mnemonic;

  return (
    <div className="page wiki-page">
      <div className="crumb">
        <Link to={{ surface: 'bible' }}>The Bible</Link> <span>/</span> {display}
      </div>

      <h1 className="verb-title">
        <Chip opcode={v.mnemonic} />
      </h1>
      <div className="verb-machine">
        <span className="tagpill">{other}</span> <code>{v.machine}</code>
        {fm(doc, 'can_error') === 'true' && <span className="tagpill">can raise E</span>}
      </div>

      {/* The document IS the page — Simple, Advanced, Reads/Writes/Flags, Edge
          Cases, the runnable Try it stage, and See also, in the author's order. */}
      <DocRenderer body={doc.ast.body} dark={dark} skipLeadingHeading />

      {intro && (
        <div className="verb-foot">
          <div className="introlesson">
            Introduced in <Link to={{ surface: 'learn', chapterId: intro.id }}>{intro.title}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
