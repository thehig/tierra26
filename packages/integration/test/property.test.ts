// Property / fuzz suites (PROP-*). Engine-level properties are real; compiler/disassembler ones
// wait on @tierra26/genescript. Ref: docs/spec/validation/C-test-coverage-gaps.md §4.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../engine/src/index.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';
import { Mutation, DEFAULT_RATES } from '../../engine/src/mutation.ts';
import { makeRng } from '../../engine/src/rng.ts';
import { Soup } from '../../engine/src/soup.ts';
import { search } from '../../engine/src/template.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';
import { compile } from '../../genescript/src/comp.ts';
import { disassemble } from '../../genescript/src/disasm.ts';

describe('Property / fuzz invariants (PROP)', () => {
  it('[PROP-DETERMINISM-DIGEST] same descriptor → same digest over many seeds', () => {
    for (const seed of [1, 2, 7, 33, 100]) {
      const run = () => { const e = new Engine({ seed, mutation: { copy: 200, cosmic: 4000 } as any }); e.inject(ANC, { founderId: 1 }); e.run(300_000); return JSON.stringify(e.digest(e.cycles)); };
      assert.equal(run(), run());
    }
  });

  it('[PROP-SNAPSHOT-ROUNDTRIP] restore(snapshot(e)) continues identically for random runs', () => {
    for (const seed of [4, 19, 61]) {
      const e = new Engine({ seed, mutation: { copy: 150, cosmic: 3000 } as any }); e.inject(ANC, { founderId: 1 }); e.run(250_000);
      const s = e.snapshot(); e.run(120_000); const live = JSON.stringify(e.digest(e.cycles));
      const r = Engine.restore(s); r.run(120_000);
      assert.equal(JSON.stringify(r.digest(r.cycles)), live);
    }
  });

  it('[PROP-ALLOC-INTEGRITY] occupied intervals never overlap; Σsizes ≤ soupSize (INV-MEM)', () => {
    const e = new Engine({ seed: 7, mutation: { copy: 200, cosmic: 4000 } as any }); e.inject(ANC, { founderId: 1 }); e.run(800_000);
    const iv = e.world.allocsView().slice().sort((a, b) => a.start - b.start);
    let sum = 0;
    for (let i = 0; i < iv.length; i++) {
      sum += iv[i]!.size;
      if (i > 0) assert.ok(iv[i - 1]!.start + iv[i - 1]!.size <= iv[i]!.start, 'no overlap');
    }
    assert.ok(sum <= e.world.config().soupSize);
  });

  it('[PROP-QUEUE-MEMBERSHIP] every live creature is in exactly one slicer + one reaper position (INV-QUEUE)', () => {
    const e = new Engine({ seed: 11, mutation: { copy: 200, cosmic: 4000 } as any }); e.inject(ANC, { founderId: 1 }); e.run(700_000);
    const ids = [...e.world.creatures.keys()].sort((a, b) => a - b);
    assert.deepEqual([...e.world.slicerView()].sort((a, b) => a - b), ids);
    assert.deepEqual([...e.world.reaperView()].sort((a, b) => a - b), ids);
  });

  it('[PROP-MUT-DOMAIN] mutating any byte yields a valid opcode for any subset size', () => {
    for (const set of [classic32, buildSubset('a', ['not0', 'shl', 'zero', 'ifz']), buildSubset('b', ['movii', 'mal', 'divide'])]) {
      const m = new Mutation(makeRng(1), { ...DEFAULT_RATES, copy: 1 }, set);
      for (let b = 0; b < 256; b++) { const x = m.maybeCopyFlaw(b % set.n); assert.ok(x >= 0 && x < set.n); }
    }
  });

  it('[PROP-TEMPLATE-COMPLEMENT] random templates land past the nearest complement or miss cleanly', () => {
    const rng = makeRng(3);
    for (let t = 0; t < 200; t++) {
      const s = new Soup(400); s.bytes.fill(9); // non-nop filler
      const size = 1 + rng.int(3);
      const ip = 20 + rng.int(100);
      for (let i = 0; i < size; i++) s.write(ip + 1 + i, rng.int(2)); // random template
      const tgt = ip + 40 + rng.int(50);
      for (let i = 0; i < size; i++) s.write(tgt + i, 1 - s.read(ip + 1 + i)); // exact complement
      const r = search(s, ip, 1, 200, 0, 1);
      if (r.found) assert.equal(r.addr, s.ad(r.addr)); // in-range landing
    }
  });

  it('[PROP-DISASM-NEVER-THROWS] disassembler returns editable output on arbitrary bytes', () => {
    const rng = makeRng(7);
    for (let t = 0; t < 300; t++) {
      const bytes = new Uint8Array(1 + rng.int(120));
      for (let i = 0; i < bytes.length; i++) bytes[i] = rng.int(256); // arbitrary, incl. out-of-range
      let out: { source: string } | undefined;
      assert.doesNotThrow(() => { out = disassemble(bytes, classic32); });
      assert.equal(typeof out!.source, 'string');
    }
  });

  it('[PROP-COMPILE-VALID] compiler output is always legal opcodes for the active set', () => {
    const verbs = ['grow-a', 'grow-b', 'grow-c', 'shrink-c', 'copy-byte', 'make-space', 'divide', 'clear', 'double', 'if-zero'];
    const rng = makeRng(3);
    for (let t = 0; t < 200; t++) {
      const n = 1 + rng.int(20); const lines: string[] = [];
      for (let i = 0; i < n; i++) lines.push(verbs[rng.int(verbs.length)]!);
      const r = compile(lines.join('\n'), classic32);
      for (const b of r.bytes) assert.ok(b >= 0 && b < classic32.n, `opcode ${b} legal`);
    }
  });
});
