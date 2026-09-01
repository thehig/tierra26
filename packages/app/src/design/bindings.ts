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
import type { KeywordCategory } from './palette.ts';
import {
  CONCEPT_BINDINGS as GEN_CONCEPTS,
  OPCODE_BINDINGS,
  isValidName,
} from '@tierra26/genescript/bindings.generated.ts';

export interface Binding { name: string; emoji: string; }

/** A concept binding also carries its colour role, so a concept chip is coloured
 *  by what it is ABOUT (a register concept reads register-blue) rather than all
 *  concepts sharing one hue. */
export interface ConceptBinding extends Binding { slug: string; category: KeywordCategory; }

/** All 32 opcode bindings, keyed by mnemonic (the real, immutable identity). */
export const BINDINGS: Readonly<Record<string, Binding>> = Object.freeze(
  Object.fromEntries(
    Object.values(OPCODE_BINDINGS).map((b) => [b.mnemonic, { name: b.name, emoji: b.emoji }]),
  ),
);

// Every concept the Bible defines, with the glyph and colour role it declares —
// the same treatment opcodes get, so `save-pile` in a sentence and the SAVE-PILE
// panel in the diagram carry the same icon.
export const CONCEPT_BINDINGS: Readonly<Record<string, ConceptBinding>> = Object.freeze(
  Object.fromEntries(
    Object.values(GEN_CONCEPTS).map((c) => [
      c.slug,
      { slug: c.slug, name: c.name, emoji: c.emoji, category: c.category as KeywordCategory },
    ]),
  ),
);

/** The binding for a concept slug, if the Bible defines one. */
export function conceptBinding(slug: string): ConceptBinding | undefined {
  return CONCEPT_BINDINGS[slug];
}

/** The glyph for a concept, or a neutral marker when it has no page yet. */
export function conceptEmoji(slug: string): string {
  return CONCEPT_BINDINGS[slug]?.emoji ?? '💠';
}

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
