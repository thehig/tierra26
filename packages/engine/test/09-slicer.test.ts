// Scheduler / Slicer (SLICE) — round-robin time-slicing = the CPU-time energy resource.
// Ref: docs/spec/engine/systems/09-scheduler-slicer.md §8 (SLICE-NNN acceptance criteria).
// Reimplements Tierra's shipped-default RanSlicerQueue (SliceStyle=2): size-proportional
// base (SizDepSlice=1, SlicePow=1 -> base = size), slice ~ uniform int in [0, 2*size].
//
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// When scheduler.ts / world.ts land, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import engine src/ modules yet — an import error would fail the whole file.
import { describe, it } from 'node:test';

describe('Scheduler / Slicer (SLICE)', () => {
  // --- Round-robin traversal & ordering ---
  it.todo(
    '[SLICE-001] round-robin visits every live creature exactly once per pass, in birth order (ascending id), then repeats from the first',
  );

  // --- Slice sizing (the one RNG use) ---
  it.todo(
    '[SLICE-002] sliceSize with SizDepSlice=1/SlicePow=1 uses base=c.size and returns rng.int(2*size+1): a uniform integer in [0, 2*size], never negative and never > 2*size',
  );
  it.todo(
    '[SLICE-003] slice sizes are deterministic from the seed (two same-seed engines yield the identical slice-size sequence) and the size draw is the ONLY RNG use in the scheduler (one draw per slice)',
  );

  // --- Death mid-slice ---
  it.todo(
    '[SLICE-004] a creature dying mid-slice ends its slice cleanly: no instruction runs after alive goes false, and the cursor advances to the correct successor (no skipped or double-visited creature)',
  );

  // --- Queue membership / newborn placement (O(1), INV-QUEUE) ---
  it.todo(
    '[SLICE-005] new creatures enter at the tail (just before the cursor) and are first scheduled on the next pass; append/remove/advance are O(1) and keep exactly one slicer position per live creature (none for the dead)',
  );

  // --- Tick loop: run(n) whole slices / step() one instruction ---
  it.todo(
    '[SLICE-006] World.run(n) executes whole slices until the budget is met or population is empty: total executed >= n with overshoot < the final slice size, and it stops immediately when slicer.length == 0',
  );
  it.todo(
    '[SLICE-007] World.step() executes exactly one instruction (advancing within the current slice, advancing the cursor when the slice is exhausted) and is consistent with run() up to whole-slice rounding',
  );
  it.todo(
    '[SLICE-008] a drawn slice size of 0 runs zero instructions yet still advances the cursor (fair round-robin, no starvation)',
  );

  // --- Energy economy: size not selected against ---
  it.todo(
    '[SLICE-009] over many passes a size-2s creature receives on average ~2x the instructions of a size-s creature (mean slice == size); size is not auto-selected against by the scheduler',
  );
});
