// Labels & Templates (LBL) — the lowering that hides Tierra's complementary nop-template
// addressing behind named labels. Kids mark places with labels and jump/find *to a label*; this
// pass turns each label into a unique nop bit-pattern (its template T) and each reference into the
// bitwise COMPLEMENT of that pattern, so the engine's complementary search (TMPL §4.2) lands where
// the author meant. Pure & deterministic: a function of source order only — no RNG, no name-hash,
// no wall-clock (C-GS-DET / GSINV-DETERMINISM).
// Ref: docs/spec/genescript/03-labels-and-templates.md (§4 algorithm, §8 criteria);
//      docs/spec/engine/systems/06-template-addressing.md (complement match nop0=0/nop1=1, NopS=1).
//
// A template bit-pattern is an ordered array of 0/1 where 0 == nop0 and 1 == nop1. The compiler
// (comp.ts) serializes a label DEFINITION as its pattern's nop0/nop1 opcodes, and a REFERENCE as
// the addressing opcode followed by the COMPLEMENT of that label's pattern. This module owns only
// the bit-pattern math and the merge/direction rules; it emits no opcode bytes and reads no engine
// state, so the compiler and the disassembler can both rely on it.

// Shortest legal template is a single nop (ISA-VM §9 MinTemplSize = 1).
const MIN_TEMPLATE_LEN = 1;

/** Bitwise complement of a template pattern: NopS(1) - b per bit, so T[i] + complement(T)[i] == 1
 *  for every bit (INV-TEMPLATE). The reference to a label carries this complement of the label's T. */
export function complement(bits: number[]): number[] {
  return bits.map((b) => 1 - b);
}

// Fixed ascending enumeration of length-k patterns: value v -> k bits, MSB first.
//   length-1: [0], [1];  length-2: [0,0],[0,1],[1,0],[1,1];  length-k: v as a k-bit integer.
// This deterministic order is the only source of allocation (no RNG, §4.2).
function patternOf(value: number, length: number): number[] {
  const bits: number[] = new Array(length);
  for (let i = 0; i < length; i++) bits[i] = (value >> (length - 1 - i)) & 1;
  return bits;
}

function bitsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Two distinct labels must get patterns a reference can tell apart: neither equal nor the
// bitwise complement of one another (§4.3). Under this rule a reference's complement(Tx) equals
// exactly one live label's pattern — X — so a hit is unambiguous as to which label.
function confusable(candidate: number[], live: number[][]): boolean {
  const comp = complement(candidate);
  for (const p of live) if (bitsEqual(candidate, p) || bitsEqual(comp, p)) return true;
  return false;
}

// Greedily allocate as many non-equal / non-complementary patterns of a fixed length as exist,
// lowest-index first. Length k yields exactly 2^(k-1) usable representatives (each pattern paired
// with its complement; we keep one per pair).
function allocateOfLength(length: number): number[][] {
  const live: number[][] = [];
  const total = 1 << length;
  for (let v = 0; v < total; v++) {
    const cand = patternOf(v, length);
    if (!confusable(cand, live)) live.push(cand);
  }
  return live;
}

/** Assign each label a UNIQUE nop bit-pattern (array of 0/1 = nop0/nop1). Distinct labels get
 *  distinct patterns AND no pattern equals another's complement, at the minimal length that keeps
 *  them all unambiguous — length grows only when the current one is exhausted (length k supports
 *  2^(k-1) labels). Deterministic in the input order; duplicate names collapse to first-seen order. */
export function assignTemplates(labelNames: string[]): Map<string, number[]> {
  // De-duplicate, preserving first-occurrence order (order is the only input — C-GS-DET).
  const names: string[] = [];
  const seen = new Set<string>();
  for (const name of labelNames) {
    if (!seen.has(name)) { seen.add(name); names.push(name); }
  }

  const out = new Map<string, number[]>();
  if (names.length === 0) return out;

  // Grow length until it holds every label unambiguously (minimal while unambiguous, §4.3).
  let length = MIN_TEMPLATE_LEN;
  let patterns = allocateOfLength(length);
  while (patterns.length < names.length) {
    length++;
    patterns = allocateOfLength(length);
  }

  for (let i = 0; i < names.length; i++) out.set(names[i]!, patterns[i]!);
  return out;
}

// Direction each control/find verb searches in, fixed by the verb (§4.1):
//   jump-back / find-back -> backward, find-forward -> forward, jump / call / find -> outward.
const DIRECTION: Record<string, 'out' | 'fwd' | 'bwd'> = {
  jump: 'out',
  'jump-back': 'bwd',
  call: 'out',
  find: 'out',
  'find-back': 'bwd',
  'find-forward': 'fwd',
};

/** The search direction a GeneScript control/find verb implies. Throws on a non-referencing verb —
 *  only the six label-referencing verbs have a direction. */
export function directionFor(verb: string): 'out' | 'fwd' | 'bwd' {
  const dir = DIRECTION[verb];
  if (dir === undefined) throw new Error(`directionFor: '${verb}' is not a label-referencing verb`);
  return dir;
}

/** Merge-avoidance (ISA-VM §5.5): the VM measures a template by scanning consecutive nop bytes
 *  until a non-nop, so a nop-run that abuts another nop-run reads as ONE longer template and
 *  silently breaks both. A non-nop spacer is required exactly when the previous run ends in a nop
 *  and the next run starts with a nop. A real verb between them already IS the spacer (returns false). */
export function needsSpacer(prevEndsInNop: boolean, nextStartsWithNop: boolean): boolean {
  return prevEndsInNop && nextStartsWithNop;
}
