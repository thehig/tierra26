// Determinism & RNG (RNG) — pending acceptance criteria for the engine's single PRNG.
// Ref: docs/spec/engine/systems/01-determinism-and-rng.md §8 (RNG-001…RNG-015).
// Modernized design: xoshiro128** (integer-only) seeded via splitmix32; replaces
// Tierra's floating-point 3-stream tdrand() (reference/tierra-v6.02/tierra/trand.c).
//
// Pending until rng.ts exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import from src/ yet — the module does not exist and an import error would
// fail the file. When rng.ts lands, replace `it.todo(name)` with `it(name, () => { ... })`.
//
// FIXME(cross-engine): the golden-vector test (RNG-004) is the guard against 32-bit
//   op divergence across JS engines. next() MUST use Math.imul + shifts + `>>> 0` only;
//   an accidental `*` (instead of Math.imul) or a missing `>>> 0` after a shift silently
//   produces a different stream on some engines. Freeze the vector and diff it.
// FIXME(modulo-bias): int(n) MUST reject the biased tail, never `next() % n`. Naive
//   modulo is biased for non-power-of-two n (low residues over-represented). RNG-007
//   must use a large sample + bucket/chi-squared check, not a handful of draws.
// FIXME(rejection-determinism): rejections consume extra next() calls (RNG-008). The
//   draw count is part of the reproducible stream — assert it, don't just assert values.
import { describe, it } from 'node:test';

describe('Determinism & RNG (RNG)', () => {
  it.todo('[RNG-001] makeRng(seed).state() is a length-4 Uint32Array, each element an integer in [0, 2^32)');
  it.todo('[RNG-002] next() returns a uint32 in [0, 2^32) and advances state (state before != after)');
  it.todo('[RNG-003] same seed yields identical sequence: two makeRng(s) emit the same first-K next() values');
  it.todo('[RNG-004] golden vector: makeRng(FIXED_SEED) matches a frozen list of first-N next() outputs (cross-engine 32-bit parity)');
  it.todo('[RNG-005] different seeds diverge: makeRng(0) and makeRng(1) produce different sequences');
  it.todo('[RNG-006] seed 0 is a normal, reproducible seed (valid non-zero state; NOT wall-clock derived; stable across wall time)');
  it.todo('[RNG-007] int(n) is unbiased: bucket counts for a non-power-of-two n are uniform within tolerance over a large sample');
  it.todo('[RNG-008] int(n) is deterministic including rejections: same seed yields same int(n) sequence and reproducible next() call count');
  it.todo('[RNG-009] int(1) returns 0; int(n) output is always in [0, n) across a range of n');
  it.todo('[RNG-010] int(n) with n <= 0 throws RangeError');
  it.todo('[RNG-011] state round-trip: setState(state()) reproduces the subsequent sequence; setState([0,0,0,0]) is rejected');
  it.todo('[RNG-012] clone() is independent: reproduces the parent future sequence and shares no state (advancing one leaves the other unchanged)');
  it.todo('[RNG-013] float01() returns a double in [0,1) and is non-simulation-only (no simulation-path source references it)');
  it.todo('[RNG-014] no forbidden globals: module uses no Math.random and no Date.now / wall clock');
  it.todo('[RNG-015] integer-only state advance: next() uses only 32-bit ops (Math.imul + shifts + >>>); no float01 / `/` / `*` on the advance path');
});
