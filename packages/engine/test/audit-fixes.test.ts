// De-masking tests for the audit fixes: the divide-gate config wiring, explicit injection
// placement (Versus symmetric placement), and per-founder census extensions (tiebreakers).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/index.ts';
import { observe, makeTank } from '../src/stats.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

describe('audit fixes — engine seams', () => {
  it('the divide gate is wired from Scenario.limits.movPropThrDiv (per-1000, integer)', () => {
    assert.equal(new Engine({}).world.movThrScaled, 700);                                 // default 0.7
    assert.equal(new Engine({ limits: { movPropThrDiv: 0.9 } } as any).world.movThrScaled, 900);
    assert.equal(new Engine({ limits: { movPropThrDiv: 0.5 } } as any).world.movThrScaled, 500);
  });

  it('inject honors an explicit placement address when the block is free', () => {
    const e = new Engine({ seed: 1, soupSize: 20000 });
    e.inject(ANC, { founderId: 1, at: 5000 });
    e.inject(ANC, { founderId: 2, at: 12000 });
    const starts = [...e.world.creatures.values()].map((c) => c.start).sort((a, b) => a - b);
    assert.deepEqual(starts, [5000, 12000]);
  });

  it('inject falls back to first-fit when the requested address is occupied', () => {
    const e = new Engine({ seed: 1, soupSize: 20000 });
    e.inject(ANC, { founderId: 1, at: 0 });
    const id = e.inject(ANC, { founderId: 2, at: 0 }); // 0 is taken → first-fit elsewhere
    assert.ok(id >= 0);
    assert.notEqual(e.world.creatures.get(id)!.start, 0);
  });

  it('the founder census carries per-founder births + avg size (Versus tiebreakers)', () => {
    const e = new Engine({ seed: 7, soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(ANC, { founderId: 1 });
    e.run(300_000);
    const f = observe(e.world, 16, makeTank(64, 64, 30000)).founders;
    assert.ok(f.births[1]! >= 2, 'founder 1 recorded cumulative births');
    assert.equal(f.avgSize[1], 80, 'founder 1 avg live size (breed-true 80-byte ancestor)');
    assert.equal(f.births[0], 0, 'no neutral births');
  });
});
