// Compiler & Lowering (COMP) — real acceptance tests (COMP-001..016).
// Ref: docs/spec/genescript/04-compiler-and-lowering.md §8.
// Back-end of the compile pipeline: source + active InstructionSet -> { bytes, sourceMap, diagnostics }.
// Opcodes are read from the active set (C-GS-NOOPCODES), never hard-coded.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/comp.ts';
import { opcodeOf } from '../src/vocab.ts';
import { hasErrors } from '../src/types.ts';
import { classic32, buildSubset, DICTIONARY } from '../../engine/src/isa.ts';

const idOf = (mnemonic: string): number => DICTIONARY.find((e) => e.mnemonic === mnemonic)!.id;
const errs = (ds: { severity: string }[]) => ds.filter((d) => d.severity === 'error');

describe('Compiler & Lowering (COMP)', () => {
  it('[COMP-001] returns { bytes, sourceMap, diagnostics }; a clean compile has no errors + non-empty bytes', () => {
    const r = compile('grow-a\ngrow-b\ndivide', classic32);
    assert.ok(r.bytes instanceof Uint8Array);
    assert.equal(typeof r.sourceMap.statementAt, 'function');
    assert.ok(Array.isArray(r.diagnostics));
    assert.equal(hasErrors(r.diagnostics), false);
    assert.ok(r.bytes.length > 0);
  });

  it('[COMP-002] a fixed verb sequence compiles to the expected classic32 opcode bytes (golden)', () => {
    const r = compile('grow-a\ngrow-b\ndivide', classic32);
    assert.deepEqual([...r.bytes], [8, 9, 31]); // incA, incB, divide in classic32 order
  });

  it('[COMP-003] nop0/nop1 (from raw) emit as bytes 0 and 1 (set.nop0/set.nop1; INV-TEMPLATE)', () => {
    const r = compile('raw nop0\nraw nop1', classic32);
    assert.deepEqual([...r.bytes], [classic32.nop0, classic32.nop1]);
    assert.deepEqual([...r.bytes], [0, 1]);
  });

  it('[COMP-004] the same verb under two sets that place its InstrId differently yields different bytes', () => {
    const full = compile('divide', classic32);
    const sub = buildSubset('early', ['divide']); // canonical order: nop0, nop1, divide -> opcode 2
    const early = compile('divide', sub);
    assert.deepEqual([...full.bytes], [31]);
    assert.deepEqual([...early.bytes], [2]);
    assert.notDeepEqual([...full.bytes], [...early.bytes]); // opcodes come from the ISA, not constants
  });

  it('[COMP-005] every emitted verb byte b satisfies activeSet.opcodeToId[b] === the verb\'s InstrId', () => {
    const r = compile('grow-a\ncopy-byte\ndivide', classic32);
    const expectIds = [idOf('incA'), idOf('movii'), idOf('divide')];
    r.bytes.forEach((b, i) => assert.equal(classic32.opcodeToId[b], expectIds[i]));
  });

  it('[COMP-006] source map is forward-complete: ranges disjoint, sorted, cover [0, len), each contiguous', () => {
    const r = compile('grow-a\ncopy-byte\ndivide', classic32);
    const rs = r.sourceMap.ranges;
    assert.ok(rs.length > 0);
    let cursor = 0;
    for (const rg of rs) {
      assert.equal(rg.start, cursor);   // sorted + gap-free
      assert.ok(rg.end > rg.start);     // contiguous, non-empty
      cursor = rg.end;
    }
    assert.equal(cursor, r.bytes.length); // covers exactly [0, len)
  });

  it('[COMP-007] source map is bidirectionally consistent: statementAt(off) owns off', () => {
    const r = compile('grow-a\ncopy-byte\ndivide', classic32);
    for (let off = 0; off < r.bytes.length; off++) {
      const stmt = r.sourceMap.statementAt(off);
      const owner = r.sourceMap.ranges.find((rg) => off >= rg.start && off < rg.end)!;
      assert.equal(stmt, owner.stmt);
    }
    assert.equal(r.sourceMap.statementAt(-1), -1);
    assert.equal(r.sourceMap.statementAt(r.bytes.length), -1);
  });

  it('[COMP-008] every emitted byte maps to exactly one statement (none unmapped, none double-owned)', () => {
    const r = compile('top:\ngrow-a\njump-back top\ndivide', classic32);
    const owners = new Map<number, number>();
    for (let off = 0; off < r.bytes.length; off++) {
      const hits = r.sourceMap.ranges.filter((rg) => off >= rg.start && off < rg.end);
      assert.equal(hits.length, 1, `byte ${off} owned by exactly one statement`);
      owners.set(off, hits[0]!.stmt);
    }
    assert.equal(owners.size, r.bytes.length);
  });

  it('[COMP-009] compiling the same (source, set) twice is byte-identical + identical ranges', () => {
    const src = 'top:\ngrow-a\njump-back top\ndivide';
    const a = compile(src, classic32);
    const b = compile(src, classic32);
    assert.deepEqual([...a.bytes], [...b.bytes]);
    assert.deepEqual(a.sourceMap.ranges, b.sourceMap.ranges);
  });

  it('[COMP-010] compilation uses no RNG/wall-clock: output is stable across repeated runs (C-GS-DET)', () => {
    const src = 'grow-a\ncopy-byte\ndivide';
    const first = [...compile(src, classic32).bytes];
    for (let k = 0; k < 5; k++) assert.deepEqual([...compile(src, classic32).bytes], first);
  });

  it('[COMP-011] a verb outside the active subset is rejected (error DIAG, no bytes) — C-GS-SUBSET', () => {
    const sub = buildSubset('early', ['incA']); // divide NOT unlocked
    const r = compile('grow-a\ndivide', sub);
    const e = errs(r.diagnostics);
    assert.ok(e.length >= 1);
    assert.equal(e[0]!.code, 'verb-not-in-subset');
    assert.equal(r.bytes.length, 0);
  });

  it('[COMP-012] the same source rejected under an early subset compiles cleanly under classic32', () => {
    const r = compile('grow-a\ndivide', classic32);
    assert.equal(hasErrors(r.diagnostics), false);
    assert.deepEqual([...r.bytes], [8, 31]);
  });

  it('[COMP-013] every emitted byte is a legal opcode: 0 <= b < activeSet.n (C-GS-VALID)', () => {
    const r = compile('top:\ngrow-a\ncopy-byte\njump-back top\nmake-space\ndivide', classic32);
    assert.ok(r.bytes.length > 0);
    for (const b of r.bytes) assert.ok(b >= 0 && b < classic32.n);
  });

  it('[COMP-014] emitted templates are well-formed: every template byte is nop0/nop1 (no MERGE)', () => {
    const r = compile('top:\ngrow-a\njump-back top', classic32);
    // label "top" -> template [0]; grow-a -> incA; jump-back -> jmpb + complement([0]) = [1].
    assert.deepEqual([...r.bytes], [opcodeOf(classic32, 'nop0'), opcodeOf(classic32, 'incA'), opcodeOf(classic32, 'jmpb'), opcodeOf(classic32, 'nop1')]);
    // template bytes (the label run + the reference complement) are exactly nop0/nop1.
    assert.ok([classic32.nop0, classic32.nop1].includes(r.bytes[0]!));
    assert.ok([classic32.nop0, classic32.nop1].includes(r.bytes[3]!));
  });

  it('[COMP-015] a failed compile returns empty bytes + empty sourceMap with the errors (no partial genome)', () => {
    const r = compile('grow-a\nwiggle-around', classic32); // wiggle-around is not a verb
    assert.ok(hasErrors(r.diagnostics));
    assert.equal(r.bytes.length, 0);
    assert.equal(r.sourceMap.ranges.length, 0);
    assert.equal(r.sourceMap.statementAt(0), -1);
  });

  it('[COMP-016] comment-only / blank source compiles to zero bytes, empty map, no diagnostics', () => {
    const r = compile('# just a comment\n\n   \n', classic32);
    assert.equal(r.bytes.length, 0);
    assert.equal(r.sourceMap.ranges.length, 0);
    assert.equal(r.diagnostics.length, 0);
    assert.equal(r.sourceMap.statementAt(0), -1);
  });
});
