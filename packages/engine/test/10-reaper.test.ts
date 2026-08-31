// Reaper / Death (REAP) — real tests. Ref: docs/spec/engine/systems/10-reaper-death.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';
import { Engine } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

function mk(threshold = 990, soupSize = 2000) {
  return new World({ soupSize, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 500, searchLimitMult: 5, sizeDependent: false, slicePow: 1, sliceSize: 25, reaperThreshold: threshold, rates: DEFAULT_RATES });
}
const spawn = (w: World, size = 20) => w.creatures.get(w.spawn(new Uint8Array(size)))!;

describe('Reaper / Death (REAP)', () => {
  it('[REAP-001] a new creature enters at the reaper tail (youngest/safest)', () => {
    const w = mk(); const a = spawn(w), b = spawn(w), c = spawn(w);
    assert.deepEqual(w.reaperView(), [a.id, b.id, c.id]); // birth order, newest last
  });

  it('[REAP-002] the head (oldest) dies first when room is needed', () => {
    const w = mk(); const a = spawn(w), b = spawn(w); void b;
    w.kill(w.reaperView()[0]!);
    assert.equal(w.creatures.has(a.id), false); // head was oldest
  });

  it('[REAP-003] an E event moves the creature one step toward the head', () => {
    const w = mk(); spawn(w); const mid = spawn(w); spawn(w);
    assert.equal(w.reaperView()[1], mid.id);
    w.raiseE(mid);
    assert.equal(w.reaperView()[0], mid.id); // moved up one
  });

  it('[REAP-004] a successful divide moves the mother one step toward the tail', () => {
    const w = mk(); const first = spawn(w); const c = spawn(w); // c is at index 1
    // give c a filled daughter and divide → moveDown
    c.cpu.reg[2] = 30; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c); c.dauWritten = 30;
    const idxBefore = w.reaperView().indexOf(c.id);
    w.soup.write(c.start + 1, 31); c.cpu.ip = c.start + 1; w.stepOne(c);
    const idxAfter = w.reaperView().indexOf(c.id);
    assert.ok(idxAfter > idxBefore); void first;
  });

  it('[REAP-005] kill frees the cell + undivided daughter and unlinks from both queues', () => {
    const w = mk(); const c = spawn(w);
    c.cpu.reg[2] = 30; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c); // mal
    const occBefore = w.allocsView().length;
    w.kill(c.id);
    assert.equal(w.creatures.has(c.id), false);
    assert.equal(w.slicerView().includes(c.id), false);
    assert.equal(w.reaperView().includes(c.id), false);
    assert.ok(w.allocsView().length < occBefore); // cell + daughter freed
  });

  it('[REAP-006] fullness past threshold triggers reaping', () => {
    // small soup + low threshold → the ancestor run must produce deaths
    const e = new Engine({ seed: 11, soupSize: 8000, reaper: { threshold: 600 } });
    e.inject(ANC); e.run(800_000);
    assert.ok(e.stats().deaths > 0);
  });

  it('[REAP-008] the base reaper uses no RNG (identical event order → identical outcome)', () => {
    const dig = () => { const e = new Engine({ seed: 5 }); e.inject(ANC); e.run(600_000); return JSON.stringify(e.digest(e.cycles)); };
    assert.equal(dig(), dig());
  });

  it('[REAP-009] fullness trigger uses integer-scaled occupancy (per-1000), never a float', () => {
    const w = mk(); spawn(w, 20);
    const f = w.fullness();
    assert.ok(Number.isInteger(f)); // per-1000 integer
    assert.equal(f, Math.floor((20 * 1000) / 2000));
  });

  it('[REAP-007] reap-to-make-room is bounded and terminates', () => {
    // fill a tiny soup so mal must reap; the run must not hang
    const e = new Engine({ seed: 3, soupSize: 3000, reaper: { threshold: 500 } });
    e.inject(ANC); e.run(500_000);
    assert.ok(e.stats().deaths > 0 && e.stats().population > 0);
  });
});
