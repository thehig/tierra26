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
import type { LoadedDoc } from '@tierra26/content/docload.ts';
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

export function chapterById(id: string): LessonChapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

export function nextChapter(id: string): LessonChapter | undefined {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  return i >= 0 ? CHAPTERS[i + 1] : undefined;
}
