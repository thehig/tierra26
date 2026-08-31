// GeneScript cross-layer invariants (GSINV).
// Ref: docs/spec/genescript/00-overview.md §6.
// These tie the compiler to the real engine: a compiled genome must load with no illegal opcode,
// the ancestor must breed true, the source map must partition the bytes, and compilation must be
// deterministic. GSINV-ROUNDTRIP stays it.todo until the disassembler (src/disasm.ts) exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/comp.ts';
import { disassemble } from '../src/disasm.ts';
import { ANCESTOR_GS, ANCESTOR_LABELED_GS } from '../src/ancestor.gs.ts';
import { classic32 } from '../../engine/src/isa.ts';
import { Engine } from '../../engine/src/index.ts';
import { hasErrors } from '../src/types.ts';

const CORPUS = [
  'grow-a\ngrow-b\ndivide',
  'top:\ngrow-a\ncopy-byte\njump-back top\nmake-space\ndivide',
  'raw nop0\nraw nop1\ncopy-byte',
];

describe('GeneScript cross-layer invariants (GSINV)', () => {
  it('[GSINV-VALID] any GeneScript that compiles produces bytes the engine loads with no illegal opcode', () => {
    for (const src of CORPUS) {
      const r = compile(src, classic32);
      assert.equal(hasErrors(r.diagnostics), false, src);
      for (const b of r.bytes) assert.ok(b >= 0 && b < classic32.n, `opcode ${b} legal for n=${classic32.n}`);
      // the engine loader accepts the genome (spawn does not throw on an illegal opcode).
      const e = new Engine({ seed: 1, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
      assert.doesNotThrow(() => e.inject(r.bytes, { founderId: 1 }));
    }
  });

  it('[GSINV-ROUNDTRIP] compile -> disassemble -> compile reaches a byte-identical fixed point', () => {
    // RT = one compile∘disassemble round-trip. RT is idempotent: after the first pass (which
    // canonicalizes label names + templates), further round-trips are byte-identical.
    const RT = (bytes: Uint8Array) => compile(disassemble(bytes, classic32).source, classic32).bytes;
    for (const src of [...CORPUS, ANCESTOR_GS]) {
      const once = RT(compile(src, classic32).bytes);
      const twice = RT(once);
      assert.deepEqual([...twice], [...once], `round-trip fixed point for: ${src.split('\n')[0]}…`);
    }
  });

  it('[GSINV-ANCESTOR] the GeneScript ancestor compiles to a genome that breeds true under sterile settings', () => {
    const r = compile(ANCESTOR_GS, classic32);
    assert.equal(hasErrors(r.diagnostics), false);
    assert.equal(r.bytes.length, 80);
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(r.bytes, { founderId: 1 });
    e.run(500_000);
    const s = e.stats();
    assert.ok(s.births > 20, `expected replication (births=${s.births})`);
    assert.equal(s.genotypes, 1, `breeds true: exactly 1 genotype (got ${s.genotypes})`);
  });

  it('[GSINV-ANCESTOR-LABELED] a LABEL-AUTHORED replicator breeds true through the label->template->complementary-search path', () => {
    // ANCESTOR_LABELED_GS uses real `label:` defs + `find-back`/`find-forward`/`jump`/`call <label>`
    // references (no `raw nop*`), so the compiler ALLOCATES the templates and their complements. If it
    // breeds true, the whole headline path — label -> unique complementary template -> the engine's
    // complementary search -> self-replication -> breed-true — is exercised end to end.
    const src = ANCESTOR_LABELED_GS;
    // sanity: it really is label-authored (defs + label references, not raw templates).
    assert.ok(/^label\d+:$/m.test(src), 'has label definitions');
    assert.ok(/\b(find-back|find-forward|jump|call)\s+label\d+/.test(src), 'has label references');
    assert.ok(!/\braw nop[01]\b/.test(src), 'no raw nop templates — the label path, not the raw path');

    const r = compile(src, classic32);
    assert.equal(hasErrors(r.diagnostics), false, 'label-authored replicator compiles');
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(r.bytes, { founderId: 1 });
    e.run(500_000);
    const s = e.stats();
    assert.ok(s.births > 20, `expected replication via labels (births=${s.births})`);
    assert.equal(s.genotypes, 1, `breeds true through the label path: exactly 1 genotype (got ${s.genotypes})`);
  });

  it('[GSINV-SOURCEMAP] every emitted byte maps to exactly one statement; each statement a contiguous range', () => {
    for (const src of CORPUS) {
      const r = compile(src, classic32);
      let cursor = 0;
      for (const rg of r.sourceMap.ranges) {
        assert.equal(rg.start, cursor);      // sorted, gap-free
        assert.ok(rg.end > rg.start);        // contiguous
        cursor = rg.end;
      }
      assert.equal(cursor, r.bytes.length);  // covers exactly [0, len)
      for (let off = 0; off < r.bytes.length; off++) {
        const hits = r.sourceMap.ranges.filter((rg) => off >= rg.start && off < rg.end);
        assert.equal(hits.length, 1, `byte ${off} owned by exactly one statement`);
        assert.equal(r.sourceMap.statementAt(off), hits[0]!.stmt);
      }
    }
  });

  it('[GSINV-DETERMINISM] compiling the same source twice yields byte-identical output + source maps', () => {
    for (const src of [...CORPUS, ANCESTOR_GS]) {
      const a = compile(src, classic32);
      const b = compile(src, classic32);
      assert.deepEqual([...a.bytes], [...b.bytes]);
      assert.deepEqual(a.sourceMap.ranges, b.sourceMap.ranges);
    }
  });
});
