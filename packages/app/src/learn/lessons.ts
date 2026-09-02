// The curriculum, read from docs/lessons/*.md.
//
// This replaces the hand-maintained `Chapter[]` that used to live in
// chapters.ts. The documents are the source now; this module only projects them
// into the small metadata record the map, the router and the engine test suite
// read. The page itself renders the document, not this projection.
//
// Order comes from the filename prefix (`08-loops.md`), which the loader sorts —
// so the curriculum reads in order on disk as well as in the app.
import { LESSON_DOCS } from 'virtual:tierra-content';
import { splitInline } from '@tierra26/content/doclang.ts';
import type { LoadedDoc } from '@tierra26/content/docload.ts';
import type { DocNode } from '@tierra26/content/types.ts';
import { entry, entryOfMnemonic } from '@tierra26/genescript/vocab.ts';
import type { Chapter, ChapterPhase } from './chapters.ts';
import { attr, childTag, childTags, findTag, geneTextOf, goalOf, promptTextOf } from '../doc/readers.ts';

export interface LessonChapter extends Chapter {
  /** The parsed document this chapter is; what ChapterPage renders. */
  doc: LoadedDoc;
  /** How many scroll waypoints the explainer has (0 for a stub chapter). */
  waypoints: number;
}

function toChapter(doc: LoadedDoc): LessonChapter {
  const fm = doc.ast.frontmatter ?? {};
  const str = (k: string, dflt = ''): string => (k in fm ? String(fm[k]) : dflt);

  // The stage genome lives in <Scrolly><Stage><EntityDesigner><Genome>.
  const designer = findTag(doc.ast.body, 'EntityDesigner');
  const demo = designer ? geneTextOf(childTag(designer, 'Genome')) : '';

  const challengeTag = findTag(doc.ast.body, 'Challenge');
  const goal = challengeTag ? goalOf(challengeTag) : undefined;
  const starter = challengeTag ? geneTextOf(childTag(challengeTag, 'Starter')) : '';
  const solutionTag = challengeTag ? childTag(challengeTag, 'Solution') : undefined;

  const requires = fm['requires'];
  const prevId = Array.isArray(requires) && requires.length ? String(requires[0]) : null;

  const soup = typeof fm['soup'] === 'number' ? fm['soup'] : undefined;
  const scrolly = findTag(doc.ast.body, 'Scrolly');
  const waypoints = scrolly ? childTags(scrolly, 'Waypoint').length : 0;

  return {
    doc,
    waypoints,
    id: doc.slug,
    no: str('no'),
    title: str('title', doc.slug),
    phase: (str('phase', 'read') as ChapterPhase),
    lede: str('lede'),
    ready: fm['ready'] === true,
    prevId,
    ...(demo ? { demo } : {}),
    ...(goal && starter
      ? { challenge: { prompt: promptTextOf(challengeTag!), starter, goal: goal.micro } }
      : {}),
    ...(solutionTag
      ? { solution: { source: geneTextOf(solutionTag), budget: attr.int(solutionTag, 'budget', 500) } }
      : {}),
    ...(soup !== undefined ? { soup } : {}),
  };
}

export const CHAPTERS: readonly LessonChapter[] = LESSON_DOCS.map(toChapter);

// ---------------------------------------------------------------------------
// Which chapter introduces an instruction — DERIVED from the documents.
//
// This used to come from a hand-maintained `unlocks.verbs` list on a second,
// TypeScript curriculum. Deriving it instead means the answer cannot drift from
// what the lessons actually say: a chapter introduces an instruction when it is
// the first to NAME it, either as a {token} in its prose or as a mnemonic in a
// genome it shows.
//
// It is deliberately partial. `introChapterOf` returns undefined for an
// instruction no chapter mentions, and today that is 14 of the 32 — the whole
// save-pile family, `call`/`ret`, `jmpo`, `movDC`, `movBA` and `subAAC` — because
// chapters 17-21 are still stubs. A caller must render nothing rather than
// invent a link: claiming a chapter teaches something it never mentions is the
// exact drift this replaced.
// ---------------------------------------------------------------------------
function namesIn(nodes: readonly DocNode[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.kind === 'prose') {
      // A lesson names an instruction with a token ({incA}) or a backtick.
      for (const seg of splitInline(n.markdown)) {
        if (seg.kind === 'token') out.add(seg.token);
        else if (seg.kind === 'code') out.add(seg.text);
      }
    } else if (n.kind === 'tag') {
      // ...or by showing it in a genome, which is raw mnemonics.
      if (n.text && (n.name === 'Genome' || n.name === 'Starter' || n.name === 'Solution')) {
        for (const word of n.text.split(/\s+/)) out.add(word.replace(/:$/, ''));
      }
      namesIn(n.children, out);
    }
  }
}

const INTRO_CHAPTER: ReadonlyMap<string, string> = (() => {
  const first = new Map<string, string>();
  for (const c of CHAPTERS) {
    const names = new Set<string>();
    namesIn(c.doc.ast.body, names);
    for (const name of names) {
      const v = entryOfMnemonic(name) ?? entry(name);
      if (v && !first.has(v.verb)) first.set(v.verb, c.id);
    }
  }
  return first;
})();

/** The first chapter that names `verb`, or undefined if none does yet. */
export function introChapterOf(verb: string): string | undefined {
  return INTRO_CHAPTER.get(verb);
}

export function chapterById(id: string): LessonChapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

export function nextChapter(id: string): LessonChapter | undefined {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  return i >= 0 ? CHAPTERS[i + 1] : undefined;
}
