// GeneScript vocabulary — the verb↔mnemonic table, derived from the engine's DICTIONARY so verb
// facts have a single source (C-GS-SOURCE / C-GS-NOOPCODES: no opcode literals here).
// Ref: docs/spec/genescript/02-vocabulary-and-keywords.md.
//
// Three sources, each owning what it is authoritative for:
//   engine DICTIONARY        — identity: the mnemonic and the compilable gene token.
//   bindings.generated.ts    — PRESENTATION: colour role and whether the verb takes
//                              a label target. Generated from docs/bible/opcodes/*.md,
//                              so a rebind is a docs edit + `npm run gen:bindings`.
//   META below               — the two one-line tooltips (kid / machine truth), which
//                              are shorter than, and distinct from, the Bible's prose.
import { DICTIONARY } from '../../engine/src/isa.ts';
import { OPCODE_BINDINGS } from './bindings.generated.ts';

export type KeywordCategory = 'action' | 'register' | 'marker' | 'control' | 'value';

export interface VerbEntry {
  verb: string;         // GeneScript name (== engine gene)
  mnemonic: string;     // engine mnemonic (opcode resolved via the active set, never hard-coded)
  category: KeywordCategory;
  takesTarget: boolean; // control verb that references a label
  register?: 'A' | 'B' | 'C' | 'D'; // for verbs ending in -a/-b/-c/-d (the primary register)
  kid: string;          // one-line kid definition
  machine: string;      // one-line machine truth
}

// Per-mnemonic tooltips. Category and target come from the Bible-derived bindings.
const META: Record<string, { kid: string; machine: string }> = {
  nop0: { kid: 'a landmark bit (0)', machine: 'nop; template bit 0' },
  nop1: { kid: 'a landmark bit (1)', machine: 'nop; template bit 1' },
  not0: { kid: 'flip the lowest bit of C', machine: 'C := C XOR 1' },
  shl: { kid: 'double C', machine: 'C := C << 1' },
  zero: { kid: 'set C to zero', machine: 'C := 0' },
  ifz: { kid: 'do the next line only if C is zero', machine: 'skip next unless C==0' },
  subCAB: { kid: 'C becomes A minus B', machine: 'C := A - B' },
  subAAC: { kid: 'A becomes A minus C', machine: 'A := A - C' },
  incA: { kid: 'add one to A', machine: 'A := A + 1' },
  incB: { kid: 'add one to B', machine: 'B := B + 1' },
  decC: { kid: 'take one from C', machine: 'C := C - 1' },
  incC: { kid: 'add one to C', machine: 'C := C + 1' },
  pushA: { kid: 'tuck A away in the save-pile', machine: 'push(A)' },
  pushB: { kid: 'remember B', machine: 'push(B)' },
  pushC: { kid: 'remember C', machine: 'push(C)' },
  pushD: { kid: 'remember D', machine: 'push(D)' },
  popA: { kid: 'bring A back from the save-pile', machine: 'A := pop()' },
  popB: { kid: 'bring back B', machine: 'B := pop()' },
  popC: { kid: 'bring back C', machine: 'C := pop()' },
  popD: { kid: 'bring back D', machine: 'D := pop()' },
  jmpo: { kid: 'jump to a landmark', machine: 'IP := nearest complementary template' },
  jmpb: { kid: 'jump back to a landmark', machine: 'IP := backward template' },
  call: { kid: 'run a routine and come back', machine: 'push IP; IP := outward template' },
  ret: { kid: 'go back to where call came from', machine: 'IP := pop()' },
  movDC: { kid: 'copy C into D', machine: 'D := C' },
  movBA: { kid: 'copy A into B', machine: 'B := A' },
  movii: { kid: 'copy one byte of yourself', machine: 'soup[A] := soup[B]' },
  adro: { kid: 'find a landmark (either way)', machine: 'A := addr, C := size (outward)' },
  adrb: { kid: 'find a landmark behind you', machine: 'A := addr, C := size (backward)' },
  adrf: { kid: 'find a landmark ahead', machine: 'A := addr, C := size (forward)' },
  mal: { kid: 'ask for space for a baby', machine: 'allocate daughter of size C; A := start' },
  divide: { kid: 'split off your baby as a new creature', machine: 'release the filled daughter' },
};

export const VOCAB: VerbEntry[] = DICTIONARY.map((e) => {
  const m = META[e.mnemonic];
  if (!m) throw new Error(`vocab: no metadata for mnemonic ${e.mnemonic}`);
  // The Bible is a bijection with the engine (asserted by gen-bindings and by
  // the docs corpus test), so a missing binding means a stale generated file.
  const b = OPCODE_BINDINGS[e.mnemonic];
  if (!b) throw new Error(`vocab: no binding for mnemonic ${e.mnemonic} — run \`npm run gen:bindings\``);
  const suffix = /-([abcd])$/.exec(e.gene);
  const register = suffix ? (suffix[1]!.toUpperCase() as 'A' | 'B' | 'C' | 'D') : undefined;
  return { verb: e.gene, mnemonic: e.mnemonic, category: b.category, takesTarget: b.takesTarget, register, kid: m.kid, machine: m.machine };
});

const byVerb = new Map(VOCAB.map((v) => [v.verb, v]));
const byMnemonic = new Map(VOCAB.map((v) => [v.mnemonic, v]));

export function entry(verb: string): VerbEntry | undefined { return byVerb.get(verb); }
export function entryOfMnemonic(mn: string): VerbEntry | undefined { return byMnemonic.get(mn); }
export function verbToMnemonic(verb: string): string | undefined { return byVerb.get(verb)?.mnemonic; }
export function mnemonicToVerb(mn: string): string | undefined { return byMnemonic.get(mn)?.verb; }
export function isVerb(verb: string): boolean { return byVerb.has(verb); }
export function isControlVerb(verb: string): boolean { return byVerb.get(verb)?.category === 'control'; }
export function takesTarget(verb: string): boolean { return !!byVerb.get(verb)?.takesTarget; }
export function allVerbs(): VerbEntry[] { return VOCAB.slice(); }

// ---- opcode resolution THROUGH the active set (C-GS-NOOPCODES: never a literal) ----
import type { InstructionSet } from '../../engine/src/runtime.ts';

const idOfMnemonic = new Map(DICTIONARY.map((e) => [e.mnemonic, e.id]));

/** opcode for a mnemonic in the given active set, or -1 if the mnemonic is not in that subset. */
export function opcodeOf(active: InstructionSet, mnemonic: string): number {
  const id = idOfMnemonic.get(mnemonic);
  if (id === undefined) return -1;
  for (let op = 0; op < active.n; op++) if (active.opcodeToId[op] === id) return op;
  return -1;
}
/** the mnemonic at an opcode in the given active set (reverse, for DISASM). */
export function mnemonicAtOpcode(active: InstructionSet, opcode: number): string | undefined {
  const id = active.opcodeToId[opcode];
  if (id === undefined) return undefined;
  return DICTIONARY[id]?.mnemonic;
}
/** is this verb available in the active set? (C-GS-SUBSET gating) */
export function verbInSet(active: InstructionSet, verb: string): boolean {
  const mn = verbToMnemonic(verb);
  return mn !== undefined && opcodeOf(active, mn) >= 0;
}
