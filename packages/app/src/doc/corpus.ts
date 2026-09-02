// WHERE THE CORPUS COMES FROM AT RUNTIME.
//
// The documents used to be compiled into the bundle and that was the end of it —
// which is also why editing could only ever work in dev: writing a markdown file
// on a production server changed nothing the app rendered, because the app was
// serving a copy frozen at build time.
//
// So the corpus is now FETCHED. `/api/corpus` is served by the dev server and by
// the production server from the same handler, reading docs/ off disk. The build
// -time copy survives as a FALLBACK, which keeps a plain static deployment
// (`dist/` on any dumb file host) working exactly as before — just not editable.
//
// The holder is a mutable module-level value rather than React state on purpose:
// `docs.ts` and `learn/lessons.ts` build their indexes at module scope, and
// main.tsx sets this BEFORE it dynamically imports the app, so those modules
// evaluate against a corpus that is already present. `getCorpus` throwing is the
// guard that keeps that ordering honest instead of silently serving an empty one.
import type { LoadedDoc } from '@tierra26/content/docload.ts';

/** A document as the pages see it: the parse, without the raw markdown. */
export type CorpusDoc = Omit<LoadedDoc, 'source'>;

export interface Corpus {
  /** True when the server backing this app can write docs/ — drives "Edit this page". */
  editable: boolean;
  LESSON_DOCS: readonly CorpusDoc[];
  OPCODE_DOCS: readonly CorpusDoc[];
  CONCEPT_DOCS: readonly CorpusDoc[];
}

let current: Corpus | null = null;

export function setCorpus(c: Corpus): void {
  current = c;
}

export function getCorpus(): Corpus {
  if (!current) {
    throw new Error(
      'corpus read before it was loaded — main.tsx must setCorpus() before importing the app',
    );
  }
  return current;
}

/**
 * Ask the server for the live corpus, falling back to the one compiled in.
 *
 * A failure here is not an error condition: a static host has no /api, and the
 * right behaviour there is the app it has always been, minus the editor.
 */
export async function loadCorpus(): Promise<Corpus> {
  try {
    const res = await fetch('/api/corpus', { headers: { accept: 'application/json' } });
    if (res.ok) {
      const body = (await res.json()) as Corpus;
      if (Array.isArray(body.OPCODE_DOCS) && body.OPCODE_DOCS.length) return body;
    }
  } catch {
    /* no server-side corpus — fall through to the baked one */
  }
  const baked = await import('virtual:tierra-content');
  return {
    editable: false,
    LESSON_DOCS: baked.LESSON_DOCS,
    OPCODE_DOCS: baked.OPCODE_DOCS,
    CONCEPT_DOCS: baked.CONCEPT_DOCS,
  };
}
