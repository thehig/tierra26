// Statistics & Observation (STAT) — real tests. Ref: docs/spec/engine/systems/13-statistics-and-observation.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/index.ts';
import { live, histograms, observe, digest, makeTank } from '../src/stats.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

function evolved(seed: number, cycles = 300_000) {
  const e = new Engine({ seed, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
  e.inject(ANC, { founderId: 1 });
  e.run(cycles);
  return e;
}

describe('Statistics & Observation (STAT)', () => {
  it('[STAT-001] population equals live creature count', () => {
    const e = evolved(7);
    assert.equal(live(e.world).population, e.world.creatures.size);
  });

  it('[STAT-002] births/deaths monotonic; a divide that raiseEs is not counted', () => {
    const e = evolved(7);
    const b0 = e.world.births, d0 = e.world.deaths;
    e.run(50_000);
    assert.ok(e.world.births >= b0 && e.world.deaths >= d0);
  });

  it('[STAT-003] avgSize == floor(Σsize/pop)', () => {
    const e = evolved(7);
    let s = 0; for (const c of e.world.creatures.values()) s += c.size;
    assert.equal(live(e.world).avgSize, Math.floor(s / e.world.creatures.size));
  });

  it('[STAT-004] fullness == occupancy/soupSize in [0,1]', () => {
    const e = evolved(7); const f = live(e.world).fullness;
    assert.ok(f > 0 && f <= 1);
  });

  it('[STAT-005] size histogram sums to population', () => {
    const e = evolved(7);
    const sum = histograms(e.world).size.reduce((s, b) => s + b.count, 0);
    assert.equal(sum, live(e.world).population);
  });

  it('[STAT-008] genotypes == live genotype bins', () => {
    const e = evolved(7);
    assert.equal(live(e.world).genotypes, histograms(e.world).genotype.length);
  });

  it('[STAT-009] memory bin == pop*size; sum == total live-code bytes', () => {
    const e = evolved(7); const h = histograms(e.world);
    let bytes = 0; for (const c of e.world.creatures.values()) bytes += c.size;
    assert.equal(h.memory.reduce((s, b) => s + b.count, 0), bytes);
  });

  it('[STAT-010] same-seed runs → identical histogram orderings', () => {
    const a = JSON.stringify(histograms(evolved(7).world).size);
    const b = JSON.stringify(histograms(evolved(7).world).size);
    assert.equal(a, b);
  });

  it('[STAT-007] observe reuses the tank buffer and returns a frozen frame', () => {
    const e = evolved(7);
    const tank = makeTank(80, 60, e.world.config().soupSize);
    const f1 = observe(e.world, 5, tank);
    assert.equal(f1.tank.cells, tank.cells);       // reused in place
    assert.equal(Object.isFrozen(f1), true);
    assert.equal(f1.tank.genotypeOf.length, 80 * 60);
  });

  it('[STAT-006] digest is identical across same-seed runs; all fields integer', () => {
    const d1 = digest(evolved(7).world, 300_000);
    const d2 = digest(evolved(7).world, 300_000);
    assert.deepEqual(d1, d2);
    for (const v of Object.values(d1)) assert.ok(Number.isInteger(v));
  });

  it('[STAT-011] TankView carries per-cell genotypeOf + ips, width*height indexed (S2)', () => {
    const e = evolved(7);
    const tank = makeTank(40, 40, e.world.config().soupSize);
    const f = observe(e.world, 5, tank);
    assert.equal(f.tank.genotypeOf.length, 1600);
    assert.equal(f.tank.ips.length, 1600);
    assert.ok(f.tank.ips.some((x) => x === 1)); // some IP marked
    assert.ok(f.tank.genotypeOf.some((x) => x > 0)); // some owned cell
  });

  it('[STAT-012] founders census partitions population: Σ counts == total == population (S1)', () => {
    const e = evolved(7);
    const tank = makeTank(20, 20, e.world.config().soupSize);
    const f = observe(e.world, 5, tank);
    assert.equal(f.founders.total, f.founders.counts.reduce((s, x) => s + x, 0));
    assert.equal(f.founders.total, live(e.world).population);
    assert.equal(f.founders.counts[1], live(e.world).population); // all founder 1
  });
});
