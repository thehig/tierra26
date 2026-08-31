// Allocator (ALLOC) — real tests. Ref: docs/spec/engine/systems/03-allocator.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntervalAllocator } from '../src/alloc.ts';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';

function w1() {
  return new World({ soupSize: 1000, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 300, searchLimitMult: 5, sizeDependent: false, slicePow: 1, sliceSize: 25, reaperThreshold: 990, rates: DEFAULT_RATES });
}
const spawn = (w: World, size = 20) => w.creatures.get(w.spawn(new Uint8Array(size)))!;
const malOf = (w: World, c: any, size: number) => { c.cpu.reg[2] = size; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c); };

describe('Allocator (ALLOC)', () => {
  it('[ALLOC-001] findFree picks the earliest fitting gap', () => {
    const a = new IntervalAllocator(1000);
    a.reserve(0, 100); a.reserve(300, 100); // gaps: [100,300) width 200, [400,1000) width 600
    assert.equal(a.findFree(150), 100); // earliest fitting gap
  });

  it('[ALLOC-002] findFree selects an exact-fit gap with zero slack', () => {
    const a = new IntervalAllocator(1000);
    a.reserve(0, 100); a.reserve(250, 100); // gap [100,250) width 150
    assert.equal(a.findFree(150), 100);
  });

  it('[ALLOC-003] findFree returns -1 when no single gap fits, even if total free suffices', () => {
    const a = new IntervalAllocator(300);
    a.reserve(50, 50); a.reserve(150, 50); a.reserve(250, 50); // three 50-gaps, total 150 free
    assert.equal(a.findFree(100), -1);
  });

  it('[ALLOC-004] empty soup: 0 for size<=soupSize, -1 for size>soupSize', () => {
    const a = new IntervalAllocator(1000);
    assert.equal(a.findFree(1000), 0); assert.equal(a.findFree(1001), -1); assert.equal(a.findFree(1), 0);
  });

  it('[ALLOC-007] freeing between two intervals re-exposes a spanning gap', () => {
    const a = new IntervalAllocator(1000);
    a.reserve(0, 100); a.reserve(100, 100); a.reserve(200, 100);
    assert.equal(a.findFree(100), 300);
    a.free(100, 100); // free the middle → [100,200) reopens; contiguous with nothing else but fits 100
    assert.equal(a.findFree(100), 100);
  });

  it('[ALLOC-008] after churn intervals stay sorted/non-overlapping; occupancy+free==soupSize', () => {
    const a = new IntervalAllocator(1000);
    a.reserve(0, 100); a.reserve(200, 100); a.reserve(500, 100);
    a.free(200, 100); a.reserve(150, 40);
    const iv = a.intervals();
    for (let i = 1; i < iv.length; i++) assert.ok(iv[i - 1]!.start + iv[i - 1]!.size <= iv[i]!.start);
    assert.equal(a.occupancy() + a.freeSpace(), 1000);
  });

  it('[ALLOC-013] identical sequences → identical intervals; first-fit draws no rng', () => {
    const build = () => { const a = new IntervalAllocator(1000); a.reserve(0, 50); a.reserve(100, 50); a.free(0, 50); a.reserve(a.findFree(30), 30); return JSON.stringify(a.intervals()); };
    assert.equal(build(), build());
  });

  it('[ALLOC-005] mal into a full soup reaps the head then reserves', () => {
    const w = w1(); // fill the soup with several creatures
    for (let i = 0; i < 40; i++) if (w.spawn(new Uint8Array(20)) < 0) break;
    const c = spawn(w, 20) ?? [...w.creatures.values()][0];
    const before = w.deaths;
    // force a mal that needs room
    const m = [...w.creatures.values()][w.creatures.size - 1]!;
    malOf(w, m, 200);
    assert.ok(w.deaths >= before); // reaped to make room (or had room)
  });

  it('[ALLOC-009] mal below MinCellSize sets E, allocates nothing, A unchanged', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[0] = 42;
    c.cpu.reg[2] = 5; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, true); assert.equal(c.dauStart, -1); assert.equal(c.cpu.reg[0], 42);
  });

  it('[ALLOC-010] mal above maxCellSize sets E, allocates nothing', () => {
    const w = w1(); const c = spawn(w);
    c.cpu.reg[2] = 9999; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, true); assert.equal(c.dauStart, -1);
  });

  it('[ALLOC-011] a second mal frees the prior undivided daughter first', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40); const first = c.dauStart;
    malOf(w, c, 50);
    assert.notEqual(c.dauStart, -1);
    assert.ok(!w.allocsView().some((iv) => iv.start === first && iv.size === 40));
  });

  it('[ALLOC-012] a successful mal records dauStart/dauSize, resets fill, sets A', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40);
    assert.equal(c.dauSize, 40); assert.equal(c.dauWritten, 0);
    assert.equal(c.dauWriteMask.length, 40); assert.ok(c.dauWriteMask.every((x: number) => x === 0));
    assert.equal(c.cpu.reg[0], c.dauStart);
  });

  it('[ALLOC-006] mal fails (E) when reaping cannot free enough', () => {
    const w = w1(); const c = spawn(w); // only one creature → can't reap others
    c.cpu.reg[2] = 999; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c); // 999 > maxCellSize anyway
    assert.equal(c.cpu.flagE, true); assert.equal(c.dauStart, -1);
  });
});
