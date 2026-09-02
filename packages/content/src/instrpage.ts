// ============================================================================
// [03] INSTRPAGE — one data record per classic-32 verb (instruction DEPTH).
// Ref: docs/spec/content/03-per-instruction-pages.md (§8 INSTRPAGE-001..016).
//
// This module owns the ONE piece of instruction depth a document cannot express:
// `targets`, the structured "what changes" list the genome viewer's tooltip
// renders as badges. Identity (mnemonic/kid/machine) is a PROJECTION of the VOCAB
// entry (single source, C-CON-SOURCE / C-GS-NOOPCODES) — never a copy, never a
// hard-coded mnemonic or opcode.
//
// Everything else a page used to carry here now lives in the Bible, which is the
// single authored source for it:
//   summary   -> the first sentence of `## Simple`
//   mistakes  -> `## Edge Cases`  (the tooltip reads the first bullet)
//   seeAlso   -> `## See also`
//   scenarios -> `## Try it`, an <EntityDesigner> aimed at the point being made
//
// They were authored in both places long enough to drift — the pitfall bullets
// alone disagreed with the Bible's on all 32 pages — so the copies are gone.
//
// Pure data + logic; NO Date.now / Math.random / env / filesystem at load
// (C-CON-DET, INSTRPAGE-011). --experimental-strip-types: no parameter
// properties, enums, decorators, or namespaces; `import type` for types.
// ============================================================================
import { allVerbs, entry } from '../../genescript/src/vocab.ts';
import { introLessonOf } from './progress.ts';
import type { InstructionPage, AnimationSpec } from './types.ts';

// ----------------------------------------------------------------------------
// Authored depth per verb (keyed by the GeneScript verb name). Identity fields
// are NOT here — they project from VOCAB, and the prose has moved to the Bible.
// What is left is `targets`: the structured list of what an instruction changes,
// which the tooltip renders as badges and which no prose section can carry.
// ----------------------------------------------------------------------------
interface Authored {
  targets: AnimationSpec['targets'];
}

const AUTHORED: Record<string, Authored> = {
  'mark-0': {
    targets: [{ kind: 'ip', change: 'jump' }],
  },
  'mark-1': {
    targets: [{ kind: 'ip', change: 'jump' }],
  },
  'flip-bit': {
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
  },
  double: {
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
  },
  clear: {
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
  },
  'if-zero': {
    targets: [
      { kind: 'ip', change: 'skip' },
      { kind: 'register', reg: 'C', change: 'read' },
    ],
  },
  subtract: {
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
  },
  'subtract-into-a': {
    targets: [{ kind: 'register', reg: 'A', change: 'set' }],
  },
  'grow-a': {
    targets: [{ kind: 'register', reg: 'A', change: 'increase' }],
  },
  'grow-b': {
    targets: [{ kind: 'register', reg: 'B', change: 'increase' }],
  },
  'shrink-c': {
    targets: [{ kind: 'register', reg: 'C', change: 'decrease' }],
  },
  'grow-c': {
    targets: [{ kind: 'register', reg: 'C', change: 'increase' }],
  },
  'save-a': {
    targets: [
      { kind: 'register', reg: 'A', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
  },
  'save-b': {
    targets: [
      { kind: 'register', reg: 'B', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
  },
  'save-c': {
    targets: [
      { kind: 'register', reg: 'C', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
  },
  'save-d': {
    targets: [
      { kind: 'register', reg: 'D', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
  },
  'load-a': {
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
  },
  'load-b': {
    targets: [
      { kind: 'register', reg: 'B', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
  },
  'load-c': {
    targets: [
      { kind: 'register', reg: 'C', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
  },
  'load-d': {
    targets: [
      { kind: 'register', reg: 'D', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
  },
  jump: {
    targets: [{ kind: 'ip', change: 'jump' }],
  },
  'jump-back': {
    targets: [{ kind: 'ip', change: 'jump' }],
  },
  call: {
    targets: [
      { kind: 'ip', change: 'call' },
      { kind: 'stack', change: 'push' },
    ],
  },
  return: {
    targets: [
      { kind: 'ip', change: 'return' },
      { kind: 'stack', change: 'pop' },
    ],
  },
  'copy-c-to-d': {
    targets: [{ kind: 'register', reg: 'D', change: 'set' }],
  },
  'copy-a-to-b': {
    targets: [{ kind: 'register', reg: 'B', change: 'set' }],
  },
  'copy-byte': {
    targets: [{ kind: 'soup', from: 'mother', to: 'daughter' }],
  },
  find: {
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'register', reg: 'C', change: 'set' },
    ],
  },
  'find-back': {
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'register', reg: 'C', change: 'set' },
    ],
  },
  'find-forward': {
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'register', reg: 'C', change: 'set' },
    ],
  },
  'make-space': {
    targets: [
      { kind: 'cell', change: 'allocate' },
      { kind: 'register', reg: 'A', change: 'set' },
    ],
  },
  divide: {
    targets: [{ kind: 'cell', change: 'divide' }],
  },
};

// ----------------------------------------------------------------------------
// Build the pages: identity PROJECTS VOCAB, depth comes from AUTHORED, the
// intro lesson comes from PROGRESS, and the scenario is a compiled-and-loaded
// recipe. Presentation order == VOCAB §3.3 load order (allVerbs()), which is the
// ONLY thing keyed off the array index (INSTRPAGE-016).
// ----------------------------------------------------------------------------
function buildPage(verb: string): InstructionPage {
  const e = entry(verb);
  if (e === undefined) throw new Error(`instrpage: unknown verb '${verb}'`);
  const a = AUTHORED[verb];
  if (a === undefined) throw new Error(`instrpage: no authored depth for verb '${verb}'`);

  const animation: AnimationSpec = Object.freeze({
    targets: Object.freeze(a.targets.map((t) => Object.freeze({ ...t }))) as AnimationSpec['targets'],
  });

  const intro = introLessonOf(verb);
  if (intro === undefined) throw new Error(`instrpage: no intro lesson for verb '${verb}'`);

  return Object.freeze({
    verb,
    // identity — PROJECTED from VOCAB, never redefined (C-CON-SOURCE)
    mnemonic: e.mnemonic,
    kid: e.kid,
    machine: e.machine,
    // depth — OWNED here
    animation,
    introLesson: intro,
  });
}

/** Exactly one page per classic-32 verb, in VOCAB §3.3 load order (a bijection). */
export const INSTRUCTION_PAGES: readonly InstructionPage[] = Object.freeze(
  allVerbs().map((v) => buildPage(v.verb)),
);

const PAGE_BY_VERB: ReadonlyMap<string, InstructionPage> = new Map(
  INSTRUCTION_PAGES.map((p) => [p.verb, p]),
);

/** The page for a verb, or undefined if the verb has no page (not a classic-32 verb). */
export function pageOf(verb: string): InstructionPage | undefined {
  return PAGE_BY_VERB.get(verb);
}
