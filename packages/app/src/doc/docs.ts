// The app's index over the authored corpus.
//
// `virtual:tierra-content` is produced at build time by the tierra:content Vite
// plugin (packages/app/build/tierraContent.ts) from docs/**/*.md — already
// parsed and already validated, so nothing here can fail at runtime. This module
// is only the lookup surface every page shares.
import { CONCEPT_DOCS, LESSON_DOCS, OPCODE_DOCS } from 'virtual:tierra-content';
import type { LoadedDoc } from '@tierra26/content/docload.ts';
import { foldAt, resolveToken, sectionOf, splitInline } from '@tierra26/content/doclang.ts';
import { isVerb, mnemonicToVerb, verbToMnemonic } from '@tierra26/genescript/vocab.ts';
import { CONCEPT_BINDINGS, conceptBinding } from '../design/bindings.ts';

// The same two lookups MiniMark resolves a token with, so the card and the
// sentence agree on what a token names.
const TOKENS = {
  isOpcode: (t: string) => isVerb(t) || mnemonicToVerb(t) !== undefined,
  hasConcept: (s: string) => s in CONCEPT_BINDINGS,
};

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

/** The first `## Edge Cases` bullet of a page — the one pitfall the genome
 *  viewer's tooltip surfaces as its "watch out" line.
 *
 *  This used to come from INSTRPAGE's `commonMistakes`, a second hand-authored
 *  copy of the same bullets that had already drifted from the Bible's on all 32
 *  pages. Reading the document instead means the tooltip and the page can never
 *  disagree again. `Gotchas` is the section's name on pages written before the
 *  rename; both are read while the corpus migrates. */
export function firstEdgeCase(doc: LoadedDoc | undefined): string | undefined {
  const section = sectionOf(doc?.ast.body ?? [], 'Edge Cases') ?? sectionOf(doc?.ast.body ?? [], 'Gotchas');
  const bullet = /^\s*[-*]\s+(.*)$/m.exec(section ?? '')?.[1];
  const text = plainText(bullet ?? '');
  return text || undefined;
}

/** A one-line gloss for an index entry, taken from the document ITSELF so the
 *  Bible index never carries a second copy of a description that can drift:
 *  the parenthetical in the page's `title` when it has one (concept pages read
 *  `soup (the shared memory)`), else the first sentence of its Simple section. */
export function glossOf(doc: LoadedDoc | undefined): string {
  const paren = /\(([^)]+)\)\s*$/.exec(fm(doc, 'title') ?? '');
  if (paren) return paren[1]!;
  const simple = plainText(tooltipMarkdown(doc, false) ?? '');
  return /^(.+?[.!?])(\s|$)/.exec(simple)?.[1] ?? simple;
}

/** Markdown reduced to one plain sentence-stream, for a hover card.
 *  Strips emphasis and links and collapses the wrapping — a card wants a
 *  paragraph, not a document.
 *
 *  Tokens go through the parser's OWN scanner rather than a brace regex, for the
 *  same reason MiniMark does: a token is `{name}` or `{name target}`, and a
 *  regex that knows only the first form leaves `{template signpost}` sitting in
 *  a tooltip with its braces on. What a token flattens to is the word a reader
 *  would have SEEN — the synonym for a concept written in one, the canonical
 *  name otherwise, and `name target` for an instruction with a label. */
export function plainText(markdown: string): string {
  let out = '';
  for (const seg of splitInline(markdown)) {
    if (seg.kind === 'text' || seg.kind === 'code') {
      out += seg.text;
      continue;
    }
    const r = resolveToken(seg.token, TOKENS);
    if (!r) out += seg.target ? `${seg.token} ${seg.target}` : seg.token;
    else if (r.kind === 'concept') out += seg.target ?? conceptBinding(r.slug)?.name ?? r.slug;
    else if (r.kind === 'opcode') out += seg.target ? `${r.name} ${seg.target}` : r.name;
    else out += r.id;
  }
  return out
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
