// Block Form (BLOCK) — real tests over blocks as an alternate rendering of the same AST.
// Ref: docs/spec/genescript/07-block-form.md §8. Blocks and worded text are two views of one
// Program; fromAst/toAst is a total, reversible, order-preserving mapping (docs 07 §4).
// No parser (gs.ts) yet, so Programs are built as literals below.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fromAst, toAst, palette, labelsOf } from '../src/block.ts';
import type { Block, BlockDoc } from '../src/block.ts';
import type { Program, Stmt, Loc, Diagnostic } from '../src/types.ts';
import { entry, allVerbs, verbInSet } from '../src/vocab.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';

// ---- builders (stand in for the future parser) --------------------------------------------
let _id = 0;
const nid = () => `n${_id++}`;
const loc = (nodeId: string): Loc => ({ line: 1, colStart: 1, colEnd: 1, nodeId });
const label = (name: string): Stmt => { const nodeId = nid(); return { kind: 'label', name, nodeId, loc: loc(nodeId) }; };
const verb = (v: string): Stmt => { const nodeId = nid(); return { kind: 'verb', verb: v, nodeId, loc: loc(nodeId) }; };
const control = (v: string, target: string | null): Stmt => { const nodeId = nid(); return { kind: 'control', verb: v, target, nodeId, loc: loc(nodeId) }; };
const raw = (mnemonic: string): Stmt => { const nodeId = nid(); return { kind: 'raw', mnemonic, nodeId, loc: loc(nodeId) }; };
const prog = (...statements: Stmt[]): Program => ({ statements, diagnostics: [] });

// structural view of a Program: statement fields minus source columns (block form has no cols).
const norm = (p: Program) => p.statements.map(({ loc: _loc, ...rest }) => rest);

// a program exercising one of every statement form (control with + without a target).
const sample = () => prog(
  label('copy'),                 // label
  verb('copy-byte'),             // bare verb  (movii, action)
  verb('grow-a'),                // register verb (incA, register A)
  control('jump-back', 'copy'),  // control with target (jmpb)
  control('divide', null),       // control, no target (divide)
  raw('nop0'),                   // raw escape hatch
);

describe('Block Form (BLOCK)', () => {
  it('[BLOCK-001] toAst(fromAst(ast)) is structurally identical (text→blocks→text is identity)', () => {
    const p = sample();
    assert.deepEqual(norm(toAst(fromAst(p))), norm(p));
  });

  it('[BLOCK-002] fromAst(toAst(doc)) is structurally identical (blocks→text→blocks is identity)', () => {
    const doc = fromAst(sample());
    assert.deepEqual(fromAst(toAst(doc)), doc);
  });

  it.todo('[BLOCK-003] a block program compiles to the same bytes as its worded-text twin'); // needs comp.ts (built later)

  it('[BLOCK-004] block order equals statement order; reordering blocks reorders statements', () => {
    const p = sample();
    const doc = fromAst(p);
    // block order mirrors statement order
    assert.deepEqual(doc.blocks.map((b) => b.nodeId), p.statements.map((s) => s.nodeId));
    // reversing the blocks reverses the statements
    const reversed: BlockDoc = { blocks: [...doc.blocks].reverse() };
    assert.deepEqual(toAst(reversed).statements.map((s) => s.nodeId), [...p.statements].reverse().map((s) => s.nodeId));
  });

  it('[BLOCK-005] palette(activeSet) contains exactly the verbs in the active subset (locked verbs absent)', () => {
    // full set: every vocab verb is offered
    const full = new Set(palette(classic32).map((e) => e.verb));
    assert.deepEqual(full, new Set(allVerbs().map((v) => v.verb)));
    assert.equal(palette(classic32).length, 32);

    // an early subset: palette is exactly the unlocked verbs, locked ones absent
    const sub = buildSubset('early', ['movii', 'incA', 'jmpb']); // + nop0/nop1 forced
    const paletteVerbs = new Set(palette(sub).map((e) => e.verb));
    const expected = new Set(allVerbs().filter((v) => verbInSet(sub, v.verb)).map((v) => v.verb));
    assert.deepEqual(paletteVerbs, expected);
    assert.ok(paletteVerbs.has('copy-byte'));   // movii unlocked
    assert.ok(!paletteVerbs.has('divide'));      // divide locked → absent
  });

  it('[BLOCK-006] each statement form maps to exactly one BlockKind and back (total mapping)', () => {
    const p = sample();
    const kinds = fromAst(p).blocks.map((b) => b.kind);
    assert.deepEqual(kinds, ['label', 'verb', 'registerVerb', 'control', 'control', 'raw']);
    // registerVerb and verb both fold back to a single 'verb' statement form
    const back = toAst(fromAst(p)).statements.map((s) => s.kind);
    assert.deepEqual(back, ['label', 'verb', 'verb', 'control', 'control', 'raw']);
  });

  it('[BLOCK-007] a control block’s target dropdown lists exactly the program’s current labels', () => {
    const p = prog(label('top'), verb('grow-a'), label('done'), control('jump', 'top'));
    assert.deepEqual(labelsOf(fromAst(p)), ['top', 'done']);
  });

  it('[BLOCK-008] every block carries the [02] color category for its verb/marker', () => {
    const blocks = fromAst(sample()).blocks;
    for (const b of blocks) assert.ok(typeof b.color === 'string' && b.color.length > 0);
    const byId = (k: Block['kind']) => blocks.find((b) => b.kind === k)!;
    assert.equal(byId('label').color, 'marker');
    assert.equal(byId('verb').color, entry('copy-byte')!.category);       // action
    assert.equal(byId('registerVerb').color, entry('grow-a')!.category);  // register
    assert.equal(byId('control').color, 'control');
    assert.equal(byId('raw').color, entry('mark-0')!.category);           // nop0 → marker
  });

  it('[BLOCK-009] diagnostics attach to the correct block via shared nodeId', () => {
    const p = sample();
    const target = p.statements[3]!; // the jump-back control statement
    const diag: Diagnostic = {
      code: 'undefined-label', severity: 'error',
      span: { line: 1, colStart: 1, colEnd: 1, nodeId: target.nodeId },
      message: 'no landmark called copy',
    };
    const doc = fromAst(p);
    const owner = doc.blocks.find((b) => b.nodeId === diag.span.nodeId);
    assert.ok(owner, 'a block shares the diagnostic nodeId');
    assert.equal(owner!.kind, 'control');
  });

  it('[BLOCK-010] a raw block round-trips losslessly (blocks↔text↔blocks)', () => {
    const p = prog(raw('nop0'), raw('nop1'), raw('movii'));
    const doc = fromAst(p);
    assert.deepEqual(doc.blocks.map((b) => b.raw), ['nop0', 'nop1', 'movii']);
    assert.deepEqual(toAst(doc).statements.map((s) => (s as any).mnemonic), ['nop0', 'nop1', 'movii']);
    assert.deepEqual(fromAst(toAst(doc)), doc);
  });

  it('[BLOCK-011] deleting a label referenced by a control block preserves the stale target name', () => {
    const doc = fromAst(prog(label('copy'), control('jump-back', 'copy')));
    // delete the label block while the control still references it
    const pruned: BlockDoc = { blocks: doc.blocks.filter((b) => b.kind !== 'label') };
    assert.deepEqual(labelsOf(pruned), []); // no such landmark anymore → a validator would flag it
    const ctrl = toAst(pruned).statements[0]!;
    assert.equal((ctrl as any).target, 'copy'); // stale name preserved, not silently dropped
  });

  it('[BLOCK-012] fromAst/toAst are deterministic and pure (C-GS-DET)', () => {
    const p = sample();
    const before = norm(p);
    assert.deepEqual(fromAst(p), fromAst(p));            // same input → same blocks
    const doc = fromAst(p);
    assert.deepEqual(toAst(doc), toAst(doc));            // same doc → same AST
    assert.deepEqual(norm(p), before);                  // input not mutated
  });

  it('[BLOCK-013] empty program ↔ empty BlockDoc round-trips', () => {
    assert.deepEqual(fromAst(prog()), { blocks: [] });
    assert.deepEqual(toAst({ blocks: [] }).statements, []);
    assert.deepEqual(fromAst(toAst({ blocks: [] })), { blocks: [] });
  });

  it('[BLOCK-014] blocks add no expressive power: every BlockKind has a corresponding statement form', () => {
    // every block kind produced maps to a real Stmt kind; no extra BlockKind exists.
    const stmtKinds = new Set(toAst(fromAst(sample())).statements.map((s) => s.kind));
    for (const b of fromAst(sample()).blocks) {
      const s = toAst({ blocks: [b] }).statements[0]!;
      assert.ok(stmtKinds.has(s.kind), `${b.kind} maps to a statement form`);
    }
  });
});
