// GeneScript vocabulary — the verb↔mnemonic table, derived from the engine's DICTIONARY so verb
// facts have a single source (C-GS-SOURCE / C-GS-NOOPCODES: no opcode literals here). Adds the
// Nintendo-palette category, tooltip text, and which verbs take a label target.
// Ref: docs/spec/genescript/02-vocabulary-and-keywords.md.
import { DICTIONARY } from '../../engine/src/isa.ts';

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

// Per-mnemonic metadata (category / target / tooltip). Verb name + mnemonic come from DICTIONARY.
const META: Record<string, { cat: KeywordCategory; target?: boolean; kid: string; machine: string }> = {
  nop0: { cat: 'marker', kid: 'a landmark bit (0)', machine: 'nop; template bit 0' },
  nop1: { cat: 'marker', kid: 'a landmark bit (1)', machine: 'nop; template bit 1' },
  not0: { cat: 'action', kid: 'flip the lowest bit of C', machine: 'C := C XOR 1' },
  shl: { cat: 'action', kid: 'double C', machine: 'C := C << 1' },
  zero: { cat: 'action', kid: 'set C to zero', machine: 'C := 0' },
  ifz: { cat: 'control', kid: 'do the next line only if C is zero', machine: 'skip next unless C==0' },
  subCAB: { cat: 'register', kid: 'C becomes A minus B', machine: 'C := A - B' },
  subAAC: { cat: 'register', kid: 'A becomes A minus C', machine: 'A := A - C' },
  incA: { cat: 'register', kid: 'add one to A', machine: 'A := A + 1' },
  incB: { cat: 'register', kid: 'add one to B', machine: 'B := B + 1' },
  decC: { cat: 'register', kid: 'take one from C', machine: 'C := C - 1' },
  incC: { cat: 'register', kid: 'add one to C', machine: 'C := C + 1' },
  pushA: { cat: 'register', kid: 'tuck A away in the save-pile', machine: 'push(A)' },
  pushB: { cat: 'register', kid: 'remember B', machine: 'push(B)' },
  pushC: { cat: 'register', kid: 'remember C', machine: 'push(C)' },
  pushD: { cat: 'register', kid: 'remember D', machine: 'push(D)' },
  popA: { cat: 'register', kid: 'bring A back from the save-pile', machine: 'A := pop()' },
  popB: { cat: 'register', kid: 'bring back B', machine: 'B := pop()' },
  popC: { cat: 'register', kid: 'bring back C', machine: 'C := pop()' },
  popD: { cat: 'register', kid: 'bring back D', machine: 'D := pop()' },
  jmpo: { cat: 'control', target: true, kid: 'jump to a landmark', machine: 'IP := nearest complementary template' },
  jmpb: { cat: 'control', target: true, kid: 'jump back to a landmark', machine: 'IP := backward template' },
  call: { cat: 'control', target: true, kid: 'run a routine and come back', machine: 'push IP; IP := outward template' },
  ret: { cat: 'control', kid: 'go back to where call came from', machine: 'IP := pop()' },
  movDC: { cat: 'register', kid: 'copy C into D', machine: 'D := C' },
  movBA: { cat: 'register', kid: 'copy A into B', machine: 'B := A' },
  movii: { cat: 'action', kid: 'copy one byte of yourself', machine: 'soup[A] := soup[B]' },
  adro: { cat: 'control', target: true, kid: 'find a landmark (either way)', machine: 'A := addr, C := size (outward)' },
  adrb: { cat: 'control', target: true, kid: 'find a landmark behind you', machine: 'A := addr, C := size (backward)' },
  adrf: { cat: 'control', target: true, kid: 'find a landmark ahead', machine: 'A := addr, C := size (forward)' },
  mal: { cat: 'control', kid: 'ask for space for a baby', machine: 'allocate daughter of size C; A := start' },
  divide: { cat: 'control', kid: 'split off your baby as a new creature', machine: 'release the filled daughter' },
};

export const VOCAB: VerbEntry[] = DICTIONARY.map((e) => {
  const m = META[e.mnemonic];
  if (!m) throw new Error(`vocab: no metadata for mnemonic ${e.mnemonic}`);
  const suffix = /-([abcd])$/.exec(e.gene);
  const register = suffix ? (suffix[1]!.toUpperCase() as 'A' | 'B' | 'C' | 'D') : undefined;
  return { verb: e.gene, mnemonic: e.mnemonic, category: m.cat, takesTarget: !!m.target, register, kid: m.kid, machine: m.machine };
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
