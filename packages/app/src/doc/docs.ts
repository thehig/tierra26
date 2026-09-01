// The app's index over the authored corpus.
//
// `virtual:tierra-content` is produced at build time by the tierra:content Vite
// plugin (packages/app/build/tierraContent.ts) from docs/**/*.md — already
// parsed and already validated, so nothing here can fail at runtime. This module
// is only the lookup surface every page shares.
import { CONCEPT_DOCS, LESSON_DOCS, OPCODE_DOCS } from 'virtual:tierra-content';
import type { LoadedDoc } from '@tierra26/content/docload.ts';
import { foldAt, sectionOf } from '@tierra26/content/doclang.ts';
import { verbToMnemonic } from '@tierra26/genescript/vocab.ts';

const byMnemonic = new Map(OPCODE_DOCS.map((d) => [d.slug, d]));
const byConcept = new Map(CONCEPT_DOCS.map((d) => [d.slug, d]));

/** The Bible page for an instruction, named either by mnemonic or by gene. */
export function opcodeDoc(nameOrMnemonic: string): LoadedDoc | undefined {
  return byMnemonic.get(nameOrMnemonic) ?? byMnemonic.get(verbToMnemonic(nameOrMnemonic) ?? '');
}

export function conceptDoc(slug: string): LoadedDoc | undefined {
  return byConcept.get(slug);
}

export const lessonDocs: readonly LoadedDoc[] = LESSON_DOCS;
export const opcodeDocs: readonly LoadedDoc[] = OPCODE_DOCS;
export const conceptDocs: readonly LoadedDoc[] = CONCEPT_DOCS;

/** A frontmatter value as a string, or undefined. */
export function fm(doc: LoadedDoc | undefined, key: string): string | undefined {
  const v = doc?.ast.frontmatter?.[key];
  return v === undefined ? undefined : String(v);
}

/** The slice of a definition a hover tooltip should show.
 *  Prefers the Simple/Advanced section for the reader's language mode, and falls
 *  back to whatever sits above the fold. */
export function tooltipMarkdown(doc: LoadedDoc | undefined, advanced: boolean): string | undefined {
  if (!doc) return undefined;
  const body = doc.ast.body;
  const wanted = sectionOf(body, advanced ? 'Advanced' : 'Simple');
  if (wanted) return wanted;
  const above = foldAt(body).above;
  const first = above.find((n) => n.kind === 'prose');
  return first && first.kind === 'prose' ? first.markdown : undefined;
}
