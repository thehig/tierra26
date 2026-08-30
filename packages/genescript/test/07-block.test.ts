// Block Form (BLOCK) — acceptance criteria as pending tests.
// Ref: docs/spec/genescript/07-block-form.md §8.
// Pending until implemented; node:test todo tests. No src/ imports yet.
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Block Form (BLOCK)', () => {
  it.todo('[BLOCK-001] toAst(fromAst(ast)) is structurally identical (text→blocks→text is identity)');
  it.todo('[BLOCK-002] fromAst(toAst(doc)) is structurally identical (blocks→text→blocks is identity)');
  it.todo('[BLOCK-003] a block program compiles to the same bytes as its worded-text twin');
  it.todo('[BLOCK-004] block order equals statement order; reordering blocks reorders statements');
  it.todo('[BLOCK-005] palette(activeSet) contains exactly the verbs in the active subset (locked verbs absent)');
  it.todo('[BLOCK-006] each statement form maps to exactly one BlockKind and back (total mapping)');
  it.todo("[BLOCK-007] a control block's target dropdown lists exactly the program's current labels");
  it.todo('[BLOCK-008] every block carries the [02] color category for its verb/marker');
  it.todo('[BLOCK-009] diagnostics attach to the correct block via shared nodeId');
  it.todo('[BLOCK-010] a raw block round-trips losslessly (blocks↔text↔blocks)');
  it.todo('[BLOCK-011] deleting a label referenced by a control block yields a diagnostic and preserves the stale target name');
  it.todo('[BLOCK-012] fromAst/toAst are deterministic and pure (C-GS-DET)');
  it.todo('[BLOCK-013] empty program ↔ empty BlockDoc round-trips');
  it.todo('[BLOCK-014] blocks add no expressive power: no BlockKind without a corresponding statement form');
});
