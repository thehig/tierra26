// THE BINDINGS FILE — the editable friendly layer over the fixed instruction set. Each opcode is keyed
// by its MNEMONIC (the real, immutable opcode identity, e.g. `incA`); the `name` is the friendly
// single-word GeneScript name shown in simple mode, and `emoji` is its glyph. Edit these in the
// Datasheet's Bindings editor, Export, and overwrite the two blocks below. The mnemonics never change.
//
// `name` rules (enforced by the editor): one word — letters, digits and hyphens only, no spaces or
// other symbols (e.g. `grow-a`, `copy-byte`).
import { allVerbs, verbToMnemonic } from '@tierra26/genescript/vocab.ts';

export interface Binding { name: string; emoji: string; }

// ── opcodes (all 32), keyed by mnemonic ──────────────────────────────────────────────────────────
export const BINDINGS: Record<string, Binding> = {
  nop0: { name: 'mark-0', emoji: '🔵' },
  nop1: { name: 'mark-1', emoji: '🔴' },
  not0: { name: 'flip-bit', emoji: '🪙' },
  shl: { name: 'double', emoji: '✖️' },
  zero: { name: 'clear', emoji: '🧹' },
  ifz: { name: 'if-zero', emoji: '❓' },
  subCAB: { name: 'subtract', emoji: '➖' },
  subAAC: { name: 'subtract-into-a', emoji: '🔻' },
  incA: { name: 'grow-a', emoji: '🌱' },
  incB: { name: 'grow-b', emoji: '🌿' },
  decC: { name: 'shrink-c', emoji: '🍂' },
  incC: { name: 'grow-c', emoji: '🌳' },
  pushA: { name: 'save-a', emoji: '📥' },
  pushB: { name: 'save-b', emoji: '💾' },
  pushC: { name: 'save-c', emoji: '🧺' },
  pushD: { name: 'save-d', emoji: '🗄️' },
  popA: { name: 'load-a', emoji: '📤' },
  popB: { name: 'load-b', emoji: '📂' },
  popC: { name: 'load-c', emoji: '🧲' },
  popD: { name: 'load-d', emoji: '🎣' },
  jmpo: { name: 'jump', emoji: '⏩' },
  jmpb: { name: 'jump-back', emoji: '⏪' },
  call: { name: 'call', emoji: '📞' },
  ret: { name: 'return', emoji: '🔙' },
  movDC: { name: 'copy-c-to-d', emoji: '🔃' },
  movBA: { name: 'copy-a-to-b', emoji: '🔄' },
  movii: { name: 'copy-byte', emoji: '✂️' },
  adro: { name: 'find', emoji: '🔍' },
  adrb: { name: 'find-back', emoji: '🔎' },
  adrf: { name: 'find-forward', emoji: '🔦' },
  mal: { name: 'make-space', emoji: '🏗️' },
  divide: { name: 'divide', emoji: '👶' },
};

// ── block-kind concepts. A label is the one glyph-bound kind; `raw` and `target` are structural
//    treatments (a hatched "byte" frame and a ↳ connector), not emoji, so they are not editable here.
export const CONCEPT_BINDINGS: Record<string, Binding> = {
  label: { name: 'label', emoji: '🪧' },
};

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
export function isValidName(name: string): boolean { return /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(name); }
