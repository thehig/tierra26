// The classic-32 instruction dictionary + the active InstructionSet (opcode order = gb0/opcode.map
// = ISA-VM §3.3). Dispatch keys on InstrId (= opcode index for classic32). Ref: systems/04.
import type { InstructionSet } from './runtime.ts';

// decode kind — how stepOne fills world.decoded before calling the handler
export type Kind =
  | 'NONE' | 'DST1' | 'INC' | 'DEC' | 'COND' | 'SUB3' | 'MOV2'
  | 'PUSH' | 'POP' | 'MOVII' | 'ADR' | 'JMP' | 'CALL' | 'MAL' | 'DIVIDE';

export interface DictEntry {
  id: number;
  mnemonic: string;
  gene: string;         // GeneScript name (VOCAB)
  kind: Kind;
  exec: string;         // handler key (handlers.ts)
  dir: number;          // template direction for ADR/JMP/CALL: 0 outward, 1 fwd, 2 bwd
  binding: number[];    // fixed register indices (A=0..D=3)
}

// [mnemonic, gene, kind, exec, dir, binding]
const T: [string, string, Kind, string, number, number[]][] = [
  ['nop0', 'mark-0', 'NONE', 'nop', 0, []],
  ['nop1', 'mark-1', 'NONE', 'nop', 0, []],
  ['not0', 'flip-bit', 'DST1', 'not0', 0, [2]],
  ['shl', 'double', 'DST1', 'shl', 0, [2]],
  ['zero', 'clear', 'DST1', 'zero', 0, [2]],
  ['ifz', 'if-zero', 'COND', 'ifz', 0, [2]],
  ['subCAB', 'subtract', 'SUB3', 'sub', 0, [2, 0, 1]],
  ['subAAC', 'subtract-into-a', 'SUB3', 'sub', 0, [0, 0, 2]],
  ['incA', 'grow-a', 'INC', 'inc', 0, [0]],
  ['incB', 'grow-b', 'INC', 'inc', 0, [1]],
  ['decC', 'shrink-c', 'DEC', 'dec', 0, [2]],
  ['incC', 'grow-c', 'INC', 'inc', 0, [2]],
  ['pushA', 'save-a', 'PUSH', 'push', 0, [0]],
  ['pushB', 'save-b', 'PUSH', 'push', 0, [1]],
  ['pushC', 'save-c', 'PUSH', 'push', 0, [2]],
  ['pushD', 'save-d', 'PUSH', 'push', 0, [3]],
  ['popA', 'load-a', 'POP', 'pop', 0, [0]],
  ['popB', 'load-b', 'POP', 'pop', 0, [1]],
  ['popC', 'load-c', 'POP', 'pop', 0, [2]],
  ['popD', 'load-d', 'POP', 'pop', 0, [3]],
  ['jmpo', 'jump', 'JMP', 'jmp', 0, []],
  ['jmpb', 'jump-back', 'JMP', 'jmp', 2, []],
  ['call', 'call', 'CALL', 'call', 0, []],
  ['ret', 'return', 'NONE', 'ret', 0, []],
  ['movDC', 'copy-c-to-d', 'MOV2', 'movreg', 0, [3, 2]],
  ['movBA', 'copy-a-to-b', 'MOV2', 'movreg', 0, [1, 0]],
  ['movii', 'copy-byte', 'MOVII', 'movii', 0, [0, 1]],
  ['adro', 'find', 'ADR', 'adr', 0, [0, 2]],
  ['adrb', 'find-back', 'ADR', 'adr', 2, [0, 2]],
  ['adrf', 'find-forward', 'ADR', 'adr', 1, [0, 2]],
  ['mal', 'make-space', 'MAL', 'mal', 0, [0, 2]],
  ['divide', 'divide', 'DIVIDE', 'divide', 0, []],
];

export const DICTIONARY: DictEntry[] = T.map(([mnemonic, gene, kind, exec, dir, binding], id) => ({
  id, mnemonic, gene, kind, exec, dir, binding,
}));

export function bitWidth(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(n)));
}

/** The full classic-32 set (identity opcode↔id). Subsets reuse the canonical order (S10). */
export const classic32: InstructionSet = {
  name: 'classic32',
  opcodeToId: Int16Array.from(DICTIONARY.map((e) => e.id)),
  binding: DICTIONARY.map((e) => e.binding),
  n: DICTIONARY.length,
  bitWidth: bitWidth(DICTIONARY.length),
  nop0: 0, nop1: 1,
};

/** Build a subset over the dictionary by mnemonics, in canonical order (nop0,nop1 first) — S10. */
export function buildSubset(name: string, include: string[]): InstructionSet {
  const want = new Set(include);
  want.add('nop0'); want.add('nop1');
  const ids = DICTIONARY.filter((e) => want.has(e.mnemonic)).map((e) => e.id); // canonical order preserved
  // nop0/nop1 are already first in DICTIONARY order, so opcode 0/1 hold them (INV-TEMPLATE)
  return {
    name,
    opcodeToId: Int16Array.from(ids),
    binding: ids.map((id) => DICTIONARY[id]!.binding),
    n: ids.length,
    bitWidth: bitWidth(ids.length),
    nop0: 0, nop1: 1,
  };
}
