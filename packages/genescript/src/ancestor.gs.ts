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

// A LABEL-AUTHORED self-replicator that exercises GeneScript's headline path end to end:
// real `label:` definitions -> unique complementary nop templates ([03] assignTemplates) ->
// the engine's complementary template search -> breed-true. Unlike ANCESTOR_GS (which pins the
// exact reference bytes via `raw nop*`/`raw <addr>`), this fixture names its landmarks and
// addresses them through `find-back`/`find-forward`/`jump`/`call <label>`, so compilation allocates
// the templates and their complements itself. It is the disassembler's own labelled rendering of the
// ancestor's 80 bytes (the DISASM label path), and it BREEDS TRUE under sterile settings — proving
// label -> template -> complementary-search -> replication through the label machinery.
const LABELED_LINES: string[] = [
  'label1:',
  'clear', 'flip-bit', 'double', 'double', 'copy-c-to-d',
  'find-back label1',
  'subtract-into-a', 'copy-a-to-b',
  'find-forward label6',
  'grow-a', 'subtract',
  'label2:',
  'make-space',
  'call label3',
  'divide',
  'jump label2',
  'if-zero',
  'label3:',
  'save-a', 'save-b', 'save-c',
  'label4:',
  'copy-byte', 'shrink-c', 'if-zero',
  'jump label5',
  'grow-a', 'grow-b',
  'jump label4',
  'if-zero',
  'label5:',
  'load-c', 'load-b', 'load-a', 'return',
  'label6:',
  'if-zero',
];

/** Label-authored self-replicator (real `label:` defs + `find`/`jump`/`call <label>` refs). Compiles
 *  under classic-32 and breeds true, exercising the label->template->complementary-search->breed-true
 *  path GeneScript is built around. */
export const ANCESTOR_LABELED_GS: string = LABELED_LINES.join('\n') + '\n';
