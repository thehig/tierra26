// THE BINDINGS — the friendly layer over the fixed instruction set.
//
// These are no longer authored here. The source of truth is the Bible:
//
//     docs/bible/opcodes/<mnemonic>.md   frontmatter: name, emoji, category
//     docs/bible/concepts/<slug>.md      frontmatter: emoji (glyph-bound kinds)
//
// Edit a name or an emoji THERE, then run `npm run gen:bindings`, which
// regenerates packages/genescript/src/bindings.generated.ts. The mnemonic is
// the engine's immutable identity and never changes; `name` is only what a
// learner reads, so a rebind can never change what compiles.
//
// This module stays as the app's lookup surface — same functions, same shapes,
// now keyed off the generated data — so every call site is untouched.
import { allVerbs, verbToMnemonic } from '@tierra26/genescript/vocab.ts';
import {
  CONCEPT_BINDINGS as GEN_CONCEPTS,
  OPCODE_BINDINGS,
  isValidName,
} from '@tierra26/genescript/bindings.generated.ts';

export interface Binding { name: string; emoji: string; }

/** All 32 opcode bindings, keyed by mnemonic (the real, immutable identity). */
export const BINDINGS: Readonly<Record<string, Binding>> = Object.freeze(
  Object.fromEntries(
    Object.values(OPCODE_BINDINGS).map((b) => [b.mnemonic, { name: b.name, emoji: b.emoji }]),
  ),
);

// Block-kind concepts. A label is the one glyph-bound kind; `raw` and `target` are
// structural treatments (a hatched "byte" frame and a ↳ connector), not emoji.
export const CONCEPT_BINDINGS: Readonly<Record<string, Binding>> = Object.freeze(
  Object.fromEntries(
    Object.values(GEN_CONCEPTS).map((c) => [c.slug, { name: c.name, emoji: c.emoji }]),
  ),
);

// ── derived lookups by gene/verb (the app keys emoji + names by gene; bindings key by mnemonic) ──
const nameByVerb = new Map(allVerbs().map((v) => [v.verb, BINDINGS[v.mnemonic]?.name ?? v.verb]));
const emojiByVerb = new Map(allVerbs().map((v) => [v.verb, BINDINGS[v.mnemonic]?.emoji ?? '⬛']));

/** The friendly (simple) name for a gene/verb, from the bindings (falls back to the verb itself). */
export function simpleName(verb: string): string { return nameByVerb.get(verb) ?? verb; }
/** The emoji for a gene/verb, from the bindings. */
export function emojiForVerb(verb: string): string { return emojiByVerb.get(verb) ?? '⬛'; }
/** The binding record for a gene/verb (mnemonic resolved), or undefined. */
export function bindingForVerb(verb: string): Binding | undefined { const mn = verbToMnemonic(verb); return mn ? BINDINGS[mn] : undefined; }

/** A friendly name is one word: letters, digits and hyphens only (no spaces or other symbols). */
export { isValidName };
