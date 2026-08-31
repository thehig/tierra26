// Determinism & RNG (RNG) — implemented tests for the engine's single PRNG.
// Ref: docs/spec/engine/systems/01-determinism-and-rng.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../src/rng.ts';

const U32 = 0x100000000;
// Golden vector: makeRng(12345).next() ×8 — frozen for cross-engine 32-bit parity (RNG-004).
const GOLDEN_SEED = 12345;
const GOLDEN = [1093274547, 203003357, 3741353573, 3803725158, 4178738660, 810247443, 1347789520, 4037788777];

describe('Determinism & RNG (RNG)', () => {
  it('[RNG-001] state() is a length-4 Uint32Array of integers in [0, 2^32)', () => {
    const s = makeRng(7).state();
    assert.ok(s instanceof Uint32Array);
    assert.equal(s.length, 4);
    for (const w of s) { assert.ok(Number.isInteger(w) && w >= 0 && w < U32); }
  });

  it('[RNG-002] next() returns a uint32 and advances state', () => {
    const r = makeRng(42);
    const before = r.state();
    const x = r.next();
    assert.ok(Number.isInteger(x) && x >= 0 && x < U32);
    assert.notDeepEqual(Array.from(r.state()), Array.from(before));
  });

  it('[RNG-003] same seed yields identical sequence', () => {
    const a = makeRng(999), b = makeRng(999);
    for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
  });

  it('[RNG-004] golden vector (cross-engine 32-bit parity)', () => {
    const r = makeRng(GOLDEN_SEED);
    for (const g of GOLDEN) assert.equal(r.next(), g);
  });

  it('[RNG-005] different seeds diverge', () => {
    const a = makeRng(0), b = makeRng(1);
    let same = true;
    for (let i = 0; i < 8; i++) if (a.next() !== b.next()) same = false;
    assert.equal(same, false);
  });

  it('[RNG-006] seed 0 is a normal, reproducible seed (nonzero state, stable across wall time)', () => {
    const a = makeRng(0);
    assert.notEqual((a.state()[0] | a.state()[1] | a.state()[2] | a.state()[3]) >>> 0, 0);
    const first = makeRng(0).next();
    // stable regardless of wall clock: a second construction much "later" is identical
    const second = makeRng(0).next();
    assert.equal(first, second);
  });

  it('[RNG-007] int(n) is unbiased for non-power-of-two n (bucket uniformity)', () => {
    const n = 7, N = 70000, r = makeRng(99);
    const buckets = new Array(n).fill(0);
    for (let i = 0; i < N; i++) buckets[r.int(n)]++;
    const expected = N / n;
    for (const c of buckets) assert.ok(Math.abs(c - expected) < expected * 0.05, `bucket ${c} vs ${expected}`);
  });

  it('[RNG-008] int(n) deterministic including rejections (same seq + same draw count)', () => {
    const a = makeRng(3), b = makeRng(3);
    for (let i = 0; i < 200; i++) assert.equal(a.int(7), b.int(7));
    assert.deepEqual(Array.from(a.state()), Array.from(b.state())); // identical draw count consumed
  });

  it('[RNG-009] int(1) returns 0; int(n) is always in [0, n)', () => {
    assert.equal(makeRng(5).int(1), 0);
    const r = makeRng(8);
    for (let n = 2; n < 40; n++) { const x = r.int(n); assert.ok(x >= 0 && x < n); }
  });

  it('[RNG-010] int(n) with n <= 0 throws RangeError', () => {
    const r = makeRng(1);
    assert.throws(() => r.int(0), RangeError);
    assert.throws(() => r.int(-3), RangeError);
  });

  it('[RNG-011] state round-trip reproduces the sequence; all-zero state rejected', () => {
    const r = makeRng(77);
    for (let i = 0; i < 10; i++) r.next();
    const snap = r.state();
    const expect = [r.next(), r.next(), r.next()];
    const r2 = makeRng(0);
    r2.setState(snap);
    assert.deepEqual([r2.next(), r2.next(), r2.next()], expect);
    assert.throws(() => makeRng(0).setState(Uint32Array.of(0, 0, 0, 0)));
  });

  it('[RNG-012] clone() is independent and reproduces the parent future', () => {
    const r = makeRng(21);
    for (let i = 0; i < 5; i++) r.next();
    const c = r.clone();
    // clone reproduces the parent's future sequence
    const rNext = [r.next(), r.next(), r.next()];
    const cNext = [c.next(), c.next(), c.next()];
    assert.deepEqual(cNext, rNext);
    // independence: advancing the clone further leaves the parent's state untouched
    const rState = Array.from(r.state());
    c.next(); c.next();
    assert.deepEqual(Array.from(r.state()), rState);
  });

  it('[RNG-013] float01() is a double in [0,1)', () => {
    const r = makeRng(2);
    for (let i = 0; i < 100; i++) { const f = r.float01(); assert.ok(f >= 0 && f < 1); }
  });

  it('[RNG-014] module uses no Math.random and no Date.now / wall clock', () => {
    const src = readFileSync(new URL('../src/rng.ts', import.meta.url), 'utf8');
    assert.equal(/Math\.random/.test(src), false);
    assert.equal(/Date\.(now|parse)|performance\.now|new Date/.test(src), false);
  });

  it('[RNG-015] the advance path uses only 32-bit ops (Math.imul + shifts + >>>)', () => {
    const src = readFileSync(new URL('../src/rng.ts', import.meta.url), 'utf8');
    // the next() body must not use `/` or a bare `*` (multiply must be Math.imul); `/U32` lives only in float01.
    const nextBody = src.slice(src.indexOf('next(): number'), src.indexOf('int(nExclusive'));
    assert.equal(/[^*]\*[^*]/.test(nextBody.replace(/\/\/.*$/gm, '')), false, 'no bare * in next()');
    assert.equal(/[^/]\/[^/]/.test(nextBody.replace(/\/\/.*$/gm, '')), false, 'no division in next()');
  });

  it('[RNG-016] int(1) returns 0 with one draw; int(n) is bias-free (S13)', () => {
    const r = makeRng(50);
    const before = r.state();
    assert.equal(r.int(1), 0);
    // exactly one next() consumed: applying next() to a fresh copy of `before` gives r's state
    const check = makeRng(0); check.setState(before); check.next();
    assert.deepEqual(Array.from(r.state()), Array.from(check.state()));
  });
});
