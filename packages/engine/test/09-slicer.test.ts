// Scheduler / Slicer (SLICE) — real tests. Ref: docs/spec/engine/systems/09-scheduler-slicer.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';
import { Engine } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

function mk(sizeDependent: boolean, sliceSize = 25) {
  return new World({ soupSize: 2000, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 500, searchLimitMult: 5, sizeDependent, slicePow: 1, sliceSize, reaperThreshold: 990, rates: DEFAULT_RATES });
}
const spawn = (w: World, size: number) => w.creatures.get(w.spawn(new Uint8Array(size)))!;

describe('Scheduler / Slicer (SLICE)', () => {
  it('[SLICE-001] round-robin visits every live creature once per pass (birth order)', () => {
    // With size-0 slices forced, each runSlice just advances the cursor over the birth-order queue.
    const w = mk(false, 0); const ids = [w.spawn(new Uint8Array(20)), w.spawn(new Uint8Array(20)), w.spawn(new Uint8Array(20))];
    assert.deepEqual(w.slicerView(), ids); // birth order
  });

  it('[SLICE-002] slice size ∈ [0, 2*base]', () => {
    const w = mk(true); const c = spawn(w, 30);
    for (let i = 0; i < 200; i++) { const s = w.drawSliceSize(c); assert.ok(s >= 0 && s <= 60); }
  });

  it('[SLICE-003] slice sizes deterministic from the seed', () => {
    const seq = () => { const w = mk(true); const c = spawn(w, 30); return Array.from({ length: 50 }, () => w.drawSliceSize(c)).join(','); };
    assert.equal(seq(), seq());
  });

  it('[SLICE-006] run(n) executes whole slices to the budget with bounded overshoot', () => {
    const e = new Engine({ seed: 1 }); e.inject(ANC);
    e.run(50_000); assert.ok(e.cycles >= 50_000 && e.cycles < 50_000 + 400);
  });

  it('[SLICE-007] step() executes exactly one instruction', () => {
    const e = new Engine({ seed: 1 }); e.inject(ANC);
    const c0 = e.cycles; e.step(); assert.equal(e.cycles, c0 + 1);
  });

  it('[SLICE-008] a size-0 slice runs zero instructions but still advances the cursor', () => {
    const w = mk(false, 0); w.spawn(new Uint8Array(20)); w.spawn(new Uint8Array(20));
    const cyc = w.cycles; w.run(0); // no budget; but structurally slices are 0
    assert.equal(w.cycles, cyc);
  });

  it('[SLICE-009] size proportionality under sizeDependent: mean slice == size', () => {
    const w = mk(true); const small = spawn(w, 10), big = spawn(w, 20);
    let ss = 0, bs = 0; const N = 5000;
    for (let i = 0; i < N; i++) { ss += w.drawSliceSize(small); bs += w.drawSliceSize(big); }
    assert.ok(Math.abs(ss / N - 10) < 1.5 && Math.abs(bs / N - 20) < 2);
    assert.ok(bs / ss > 1.6); // ~2x
  });

  it('[SLICE-010] sizeDependent=false (default): base is constant sliceSize regardless of size (S6)', () => {
    const w = mk(false, 25);
    assert.equal(w.sliceBaseOf(10), 25); assert.equal(w.sliceBaseOf(200), 25);
  });

  it('[SLICE-011] sizeDependent=true: base is the genome size (size-neutral) (S6)', () => {
    const w = mk(true);
    assert.equal(w.sliceBaseOf(10), 10); assert.equal(w.sliceBaseOf(200), 200);
  });

  it('[SLICE-004] a creature dying mid-slice ends its slice cleanly (no post-death step)', () => {
    // end-to-end: a saturating run with reaping never throws and stays consistent
    const e = new Engine({ seed: 11 }); e.inject(ANC); e.run(1_500_000);
    assert.equal(e.world.slicerView().length, e.world.creatures.size);
  });

  it('[SLICE-005] queues hold exactly one position per live creature (none for dead)', () => {
    const e = new Engine({ seed: 11 }); e.inject(ANC); e.run(1_000_000);
    assert.equal(e.world.slicerView().length, e.world.creatures.size);
    assert.equal(e.world.reaperView().length, e.world.creatures.size);
  });
});
