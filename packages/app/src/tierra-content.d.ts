// Ambient declaration for the virtual module emitted by the `tierra:content`
// Vite plugin (packages/app/build/tierraContent.ts).
//
// This file lives under src/ deliberately: the app tsconfig's `include` is
// ["src", "vite.config.ts", "test"], and a `declare module` block is ambient
// across the whole program — so the app, the node test project and the
// storybook/browser project all see these types from this one place.
//
// The shapes are a projection of the parser's own output types, never a second
// source of truth: a drift between them is a compile error.
declare module 'virtual:tierra-content' {
  import type { LoadedDoc } from '@tierra26/content/docload.ts';

  /** A document as every page reads it. `source` is stripped here — the raw
   *  markdown is its own module so it never lands in the main chunk. */
  type CorpusDoc = Omit<LoadedDoc, 'source'>;

  /** Waypoint-guided lesson documents, in curriculum (filename) order. */
  export const LESSON_DOCS: readonly CorpusDoc[];
  /** One Bible page per engine mnemonic. */
  export const OPCODE_DOCS: readonly CorpusDoc[];
  /** Bible concept pages (soup, daughter, flags, ...). */
  export const CONCEPT_DOCS: readonly CorpusDoc[];
}
