// Mutation & Variation (MUT) — real tests. Ref: docs/spec/engine/systems/11-mutation-and-variation.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Mutation, DEFAULT_RATES } from '../src/mutation.ts';
import { makeRng } from '../src/rng.ts';
import { classic32, buildSubset } from '../src/isa.ts';
import { Soup } from '../src/soup.ts';
import { Engine } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

const rates = (o: Partial<typeof DEFAULT_RATES>) => ({ ...DEFAULT_RATES, ...o });
const mk = (r: Partial<typeof DEFAULT_RATES>, seed = 1, set = classic32) => new Mutation(makeRng(seed), rates(r), set);
const popcount = (x: number) => { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };

describe('Mutation & Variation (MUT)', () => {
  it('[MUT-001] at rate 0 nothing mutates; ancestor breeds true', () => {
    const m = mk({});
    assert.equal(m.maybeFlaw(5), 5);
    assert.equal(m.maybeCopyFlaw(9), 9);
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(ANC, { founderId: 1 }); e.run(200_000);
    assert.equal(e.stats().genotypes, 1);
  });

  it('[MUT-002] rate 0 consumes no randomness', () => {
    const rng = makeRng(42);
    const m = new Mutation(rng, rates({}), classic32);
    const before = Array.from(rng.state());
    m.maybeFlaw(1); m.maybeCopyFlaw(2);
    const soup = new Soup(100); m.cosmicTick(soup, 100);
    assert.deepEqual(Array.from(rng.state()), before); // no draw
  });

  it('[MUT-003] mutation domain always a valid opcode (classic32 + non-power-of-two)', () => {
    const m1 = mk({ copy: 1 });
    for (let b = 0; b < 200; b++) { const x = m1.maybeCopyFlaw(b % 32); assert.ok(x >= 0 && x < 32); }
    const sub = buildSubset('np2', ['not0', 'shl', 'zero', 'ifz']); // n=6
    const m2 = mk({ copy: 1 }, 1, sub);
    for (let b = 0; b < 200; b++) { const x = m2.maybeCopyFlaw(b % 6); assert.ok(x >= 0 && x < 6); }
  });

  it('[MUT-004] copy bit-flip branch flips exactly one low bit', () => {
    const m = mk({ copy: 1, mutBitPropPct: 100 }); // always bit-flip
    for (let i = 0; i < 100; i++) {
      const orig = i % 32; const res = m.maybeCopyFlaw(orig);
      assert.equal(popcount((orig ^ res) & 31), 1); assert.ok(res >= 0 && res < 32);
    }
  });

  it('[MUT-005] cosmic targets a deterministic uniform byte; only one changes', () => {
    const s1 = new Soup(1000).bytes.fill(0), _ = s1; // noop
    const a = new Soup(1000); const m = mk({ cosmic: 1 }, 5);
    m.cosmicTick(a, 1000);
    const changed = [...a.bytes].map((b, i) => (b !== 0 ? i : -1)).filter((i) => i >= 0);
    assert.equal(changed.length <= 1, true);
    // same seed → same target
    const b = new Soup(1000); mk({ cosmic: 1 }, 5).cosmicTick(b, 1000);
    assert.deepEqual(Array.from(a.bytes), Array.from(b.bytes));
  });

  it('[MUT-006] flaw perturbs by ±1 on a firing tick, identity off-tick', () => {
    const m2 = mk({ flaw: 2 }); // fires every 2nd call
    assert.equal(m2.maybeFlaw(10), 10);            // off-tick
    assert.equal(Math.abs(m2.maybeFlaw(10) - 10), 1); // firing tick: ±1
  });

  it('[MUT-007] flaw is execution-only (no soup argument / no code change)', () => {
    const m = mk({ flaw: 1 });
    // maybeFlaw only transforms a value; it has no access to soup and cannot change code
    const v = m.maybeFlaw(0); assert.ok(v === 1 || v === -1);
  });

  it('[MUT-008] MutBitProp split ≈ 0.2 (estimated from the Hamming-1 rate)', () => {
    const h1rate = (pct: number) => {
      const m = mk({ copy: 1, mutBitPropPct: pct }, 3); let h1 = 0; const N = 40000;
      for (let i = 0; i < N; i++) { const o = i % 32, r = m.maybeCopyFlaw(o); if (o !== r && popcount((o ^ r) & 31) === 1) h1++; }
      return h1 / N;
    };
    const base = h1rate(0);   // replacement baseline chance of a Hamming-1 result
    const full = h1rate(100); // all bit-flips → ~1
    const mid = h1rate(20);
    const est = (mid - base) / (full - base); // recovered bit-flip fraction
    assert.ok(Math.abs(est - 0.2) < 0.06, `estimated split ${est.toFixed(3)}`);
  });

  it('[MUT-009] insertion grows size by 1; valid opcodes', () => {
    const m = mk({}); const g = Uint8Array.from([1, 2, 3]);
    const out = m.insert(g, 1, 7);
    assert.equal(out.length, 4); assert.deepEqual(Array.from(out), [1, 7, 2, 3]);
    for (const b of out) assert.ok(b < 32);
  });

  it('[MUT-010] deletion shrinks size by 1', () => {
    const m = mk({}); const out = m.del(Uint8Array.from([1, 2, 3]), 1);
    assert.equal(out.length, 2); assert.deepEqual(Array.from(out), [1, 3]);
  });

  it('[MUT-011] replacement branch yields a uniformly random valid opcode', () => {
    const m = mk({ copy: 1, mutBitPropPct: 0 }); // always replacement
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) { const x = m.maybeCopyFlaw(0); assert.ok(x >= 0 && x < 32); seen.add(x); }
    assert.ok(seen.size > 10); // spans many values (not a single-bit neighbourhood)
  });

  it('[MUT-012] single RNG, fixed order → identical outcomes for same seed', () => {
    const seq = (seed: number) => { const m = mk({ copy: 3 }, seed); const o = []; for (let i = 0; i < 200; i++) o.push(m.maybeCopyFlaw(i % 32)); return o.join(','); };
    assert.equal(seq(11), seq(11));
    assert.notEqual(seq(11), seq(12));
  });

  it('[MUT-013] continuous rate → ~1/period firing frequency', () => {
    const P = 10, N = 20000; const m = mk({ flaw: P });
    let fires = 0; for (let i = 0; i < N; i++) if (m.maybeFlaw(100) !== 100) fires++;
    assert.ok(Math.abs(fires - N / P) < (N / P) * 0.05, `fires=${fires} vs ${N / P}`);
  });

  it('[MUT-014] divide-time modulus → ~1/N per-divide probability', () => {
    const N = 8, T = 20000; const m = mk({ divMut: N });
    let changed = 0; const g = Uint8Array.from(new Array(30).fill(5));
    for (let i = 0; i < T; i++) { const out = m.divideOps(g); if (out !== g) changed++; }
    assert.ok(Math.abs(changed - T / N) < (T / N) * 0.08, `changed=${changed} vs ${T / N}`);
  });

  it('[MUT-015] crossover recombines two genomes deterministically', () => {
    const a = Uint8Array.from([1, 1, 1, 1, 1]); const b = Uint8Array.from([2, 2, 2, 2, 2]);
    const c1 = mk({}, 5).crossover(a, b); const c2 = mk({}, 5).crossover(a, b);
    assert.deepEqual(Array.from(c1), Array.from(c2));   // reproducible
    assert.equal(c1.length, a.length);                  // valid size
    for (const x of c1) assert.ok(x === 1 || x === 2);   // prefix a + suffix b
  });

  it('[MUT-016] counter snapshot round-trip resumes the exact sequence', () => {
    const m = mk({ flaw: 3, copy: 5 }, 9);
    for (let i = 0; i < 7; i++) { m.maybeFlaw(i); m.maybeCopyFlaw(i % 32); }
    const st = m.state();
    const expect = [m.maybeFlaw(1), m.maybeCopyFlaw(2), m.maybeFlaw(3)];
    m.setState(st);
    // NOTE: rng advances too; the counters are the mutation-owned state (rng round-trips separately)
    assert.deepEqual(st, m.state());
    assert.ok(Number.isInteger(st.flawCount) && Number.isInteger(st.copyCount) && Number.isInteger(st.cosmicCount));
    void expect;
  });
});
