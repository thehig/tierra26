// Compiler & Lowering (COMP) — pending acceptance tests.
// Ref: docs/spec/genescript/04-compiler-and-lowering.md §8 (COMP-NNN).
// Back-end of the compile pipeline: checked AST + active InstructionSet ->
//   { bytes: Uint8Array, sourceMap, diagnostics }.
// Resolves verbs -> InstrId via the engine ISA (NO hard-coded opcodes, C-GS-NOOPCODES),
// invokes the label/template pass [03], emits opcode bytes for the active set, and builds a
// bidirectional statement <-> byte-range source map (GSINV-SOURCEMAP).
//
// Contracts: C-GS-DET, C-GS-VALID, C-GS-SUBSET, C-GS-NOOPCODES.
//
// Pending until the compiler exists; encoded as node:test todo tests (spec-as-checklist).
// NO src imports yet (the modules don't exist — an import error would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Compiler & Lowering (COMP)', () => {
  it.todo('[COMP-001] compile(source, activeSet) returns { bytes: Uint8Array, sourceMap, diagnostics }; a clean compile has no error diagnostics and non-empty bytes');
  it.todo('[COMP-002] a fixed verb sequence compiles to the expected opcode bytes for classic32 (golden byte fixture)');
  it.todo('[COMP-003] nop0/nop1 (from a template or raw nop0/raw nop1) emit as bytes 0 and 1 respectively (INV-TEMPLATE)');
  it.todo('[COMP-004] the same verb under two active sets that place its InstrId at different opcodes yields different bytes (opcodes come from the ISA, not constants — C-GS-NOOPCODES)');
  it.todo('[COMP-005] the compiler imports the active InstructionSet from @tierra26/engine: for every emitted verb byte b, activeSet.opcodeToId[b] equals the verb resolved InstrId (no hard-coded opcode map — C-GS-NOOPCODES)');
  it.todo('[COMP-006] the source map is forward-complete: ranges are disjoint, sorted, and cover [0, bytes.length) with no gaps or overlaps; each statement range is contiguous (GSINV-SOURCEMAP)');
  it.todo('[COMP-007] the source map is bidirectionally consistent: for every offset, statementAt(off) returns the one statement whose ByteRange contains off (GSINV-SOURCEMAP)');
  it.todo('[COMP-008] every emitted byte maps to exactly one statement — no byte unmapped, none double-owned (GSINV-SOURCEMAP, counting form)');
  it.todo('[COMP-009] compiling the same (source, activeSet) twice yields byte-identical bytes and an identical source map (C-GS-DET / GSINV-DETERMINISM)');
  it.todo('[COMP-010] compilation uses no RNG and no wall-clock: output does not vary across runs or with injected clock/RNG stubs (C-GS-DET)');
  it.todo('[COMP-011] a verb outside the active subset is rejected with an error-severity DIAG anchored to its statement, and no bytes are emitted (C-GS-SUBSET; tutorial gating)');
  it.todo('[COMP-012] the same source rejected under an early subset compiles cleanly under classic32 (gating is about the active set, not the source)');
  it.todo('[COMP-013] every emitted byte is a legal opcode: for all b in bytes, 0 <= b < activeSet.n (C-GS-VALID / GSINV-VALID)');
  it.todo('[COMP-014] emitted templates are well-formed: every template byte is nop0/nop1, each run length >= MinTemplSize (1), and [03] output is emitted verbatim with no adjacent-template MERGE (C-GS-VALID; ISA-VM 5.5)');
  it.todo('[COMP-015] a failed compile (any error diagnostic) returns empty bytes and an empty sourceMap — no partial genome — with the errors in diagnostics');
  it.todo('[COMP-016] comment-only / blank source compiles to zero bytes with an empty, vacuously complete source map and no diagnostics');
});
