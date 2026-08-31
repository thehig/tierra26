// The canonical Tierra ancestor "0080aaa" — 80 instructions, classic-32 opcodes.
// Source of truth: reference/tierra-v6.02/tierra/gb0/0080aaa.tie (hex opcode column),
// transcribed + cross-checked against gb0/opcode.map in docs/spec/validation/D-final-reference-recheck.md §4.
// Opcode indices are the classic-32 load order (== ISA-VM-SPEC §3.3): nop0=0 … divide=31.
// This is the authoritative subject of the breed-true golden test (INT-ANCESTOR-GOLDEN, S11/A-11).
// It does NOT depend on the GeneScript compiler; a compiler-path parity check (GSINV-ANCESTOR) is separate.

/** The 80 opcode bytes, index 0..79 (mother cell layout). */
export const ANCESTOR_0080AAA: Uint8Array = new Uint8Array([
  /* 0*/ 1, 1, 1, 1, 4, 2, 3, 3, 24, 28,   // nop1×4, zero, not0, shl, shl, movDC, adrb
  /*10*/ 0, 0, 0, 0, 7, 25, 29, 0, 0, 0,    // nop0×4, subAAC, movBA, adrf, nop0×3
  /*20*/ 1, 8, 6, 1, 1, 0, 1, 30, 22, 0,    // nop1, incA, subCAB, nop1,nop1,nop0,nop1, mal, call, nop0
  /*30*/ 0, 1, 1, 31, 20, 0, 0, 1, 0, 5,    // nop0,nop1,nop1, divide, jmpo, nop0,nop0,nop1,nop0, ifz
  /*40*/ 1, 1, 0, 0, 12, 13, 14, 1, 0, 1,   // nop1,nop1,nop0,nop0, pushA,pushB,pushC, nop1,nop0,nop1
  /*50*/ 0, 26, 10, 5, 20, 0, 1, 0, 0, 8,   // nop0, movii, decC, ifz, jmpo, nop0,nop1,nop0,nop0, incA
  /*60*/ 9, 20, 0, 1, 0, 1, 5, 1, 0, 1,     // incB, jmpo, nop0,nop1,nop0,nop1, ifz, nop1,nop0,nop1
  /*70*/ 1, 18, 17, 16, 23, 1, 1, 1, 0, 5,  // nop1, popC,popB,popA, ret, nop1,nop1,nop1,nop0, ifz
]);

/** Breed-true oracle from the .tie header (the golden test asserts these). */
export const ANCESTOR_0080AAA_META = {
  genotype: '0080aaa',
  size: 80,
  parent: '0666god',          // hand-written progenitor lineage (informational)
  breedTrue: true,            // an unmutated 0080aaa copies 80 bytes and breeds true
  movDaught: 80,              // bytes copied into each daughter
  instToFirstDivide: 827,     // instructions executed to the first divide (approx oracle)
  neverUses: ['adro'],        // the one classic-32 op the ancestor does not exercise (opcode 27)
} as const;
