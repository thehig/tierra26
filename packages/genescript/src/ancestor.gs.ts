// The GeneScript ancestor — the friendly-language source that compile()s to the canonical Tierra
// self-replicator 0080aaa (80 classic-32 opcode bytes) and BREEDS TRUE under sterile settings
// (GSINV-ANCESTOR). Action/register/target-less ops are written as friendly verbs; the raw
// nop-template bytes and the three addressing/jump/call opcodes are written with `raw <mnemonic>`
// so the exact reference byte sequence is reproduced verbatim (no compiler-allocated templates).
// Cross-checked byte-for-byte against packages/engine/test/fixtures/ancestor-0080aaa.ts.

// One line per emitted byte, in mother-cell layout order (index 0..79).
const LINES: string[] = [
  /* 0*/ 'raw nop1', 'raw nop1', 'raw nop1', 'raw nop1', 'clear', 'flip-bit', 'double', 'double', 'copy-c-to-d', 'raw adrb',
  /*10*/ 'raw nop0', 'raw nop0', 'raw nop0', 'raw nop0', 'subtract-into-a', 'copy-a-to-b', 'raw adrf', 'raw nop0', 'raw nop0', 'raw nop0',
  /*20*/ 'raw nop1', 'grow-a', 'subtract', 'raw nop1', 'raw nop1', 'raw nop0', 'raw nop1', 'make-space', 'raw call', 'raw nop0',
  /*30*/ 'raw nop0', 'raw nop1', 'raw nop1', 'divide', 'raw jmpo', 'raw nop0', 'raw nop0', 'raw nop1', 'raw nop0', 'if-zero',
  /*40*/ 'raw nop1', 'raw nop1', 'raw nop0', 'raw nop0', 'save-a', 'save-b', 'save-c', 'raw nop1', 'raw nop0', 'raw nop1',
  /*50*/ 'raw nop0', 'copy-byte', 'shrink-c', 'if-zero', 'raw jmpo', 'raw nop0', 'raw nop1', 'raw nop0', 'raw nop0', 'grow-a',
  /*60*/ 'grow-b', 'raw jmpo', 'raw nop0', 'raw nop1', 'raw nop0', 'raw nop1', 'if-zero', 'raw nop1', 'raw nop0', 'raw nop1',
  /*70*/ 'raw nop1', 'load-c', 'load-b', 'load-a', 'return', 'raw nop1', 'raw nop1', 'raw nop1', 'raw nop0', 'if-zero',
];

/** The GeneScript ancestor source (compiles to the 80-byte 0080aaa genome; breeds true). */
export const ANCESTOR_GS: string = LINES.join('\n') + '\n';
