// Engine API & Scenarios (API) — real tests. Ref: docs/spec/engine/systems/15-engine-api-and-scenarios.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, normalizeScenario, DEFAULT_SCENARIO, type RunDescriptor } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

describe('Engine API & Scenarios (API)', () => {
  it('[API-001] normalizeScenario({}) fills documented defaults', () => {
    const s = normalizeScenario({});
    assert.equal(s.soupSize, 60000); assert.equal(s.seed, 0);
    assert.equal(s.instructionSet, 'classic32'); assert.equal(s.limits.minCellSize, 12);
  });

  it('[API-002] invalid scenario is rejected (throws)', () => {
    assert.throws(() => normalizeScenario({ soupSize: 0 }));
    assert.throws(() => normalizeScenario({ soupSize: -5 }));
  });

  it('[API-003] inject places at first gap; returns stable monotonic id', () => {
    const e = new Engine({ seed: 1 });
    const a = e.inject(ANC), b = e.inject(ANC);
    assert.equal(a, 1); assert.equal(b, 2);
    assert.equal(e.world.creatures.get(a)!.start, 0);
    assert.equal(e.world.creatures.get(b)!.start, ANC.length);
  });

  it('[API-004] run(n) advances cycles by ~n (whole-slice overshoot bounded)', () => {
    const e = new Engine({ seed: 1 }); e.inject(ANC);
    e.run(100_000);
    assert.ok(e.cycles >= 100_000 && e.cycles < 100_000 + 400); // overshoot < max slice (2*25)
  });

  it('[API-005] stats() reflects the world', () => {
    const e = new Engine({ seed: 7 }); e.inject(ANC, { founderId: 1 }); e.run(300_000);
    const s = e.stats();
    assert.equal(s.population, e.world.creatures.size);
    assert.equal(s.births, e.world.births);
    assert.ok(s.population > 1 && s.births > 1);
  });

  it('[API-006] no DOM/host globals (worker-portable)', () => {
    for (const f of ['index.ts', 'world.ts', 'stats.ts', 'mutation.ts']) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
      assert.equal(/\bdocument\b|\bwindow\b|\bpostMessage\b|Date\.now|Math\.random/.test(src), false, `${f} references a host global`);
    }
  });

  it('[API-007] replay(desc) reproduces a run', () => {
    const desc: RunDescriptor = { engineVersion: Engine.version, scenario: { seed: 5 } as any, injections: [{ atCycle: 0, genome: ANC, founderId: 1 }], cycles: 400_000 };
    const live = new Engine({ seed: 5 }); live.inject(ANC, { founderId: 1 }); live.run(400_000);
    const rep = Engine.replay(desc);
    assert.deepEqual(rep.digest(rep.cycles), live.digest(live.cycles));
  });

  it('[API-008] a tutorial SubsetSpec builds a smaller active set', () => {
    const e = new Engine({ instructionSet: { base: 'classic32', include: ['movii', 'ifz', 'mal', 'divide', 'adrb', 'adrf'], name: 'ch' } });
    assert.ok(e.world.activeSet.n < 32);
    assert.equal(e.world.activeSet.nop0, 0); assert.equal(e.world.activeSet.nop1, 1);
  });

  it('[API-009] snapshot()/restore() round-trip continues identically', () => {
    const e = new Engine({ seed: 3, mutation: { copy: 200, cosmic: 4000 } as any }); e.inject(ANC, { founderId: 1 }); e.run(200_000);
    const s = e.snapshot(); e.run(100_000); const live = JSON.stringify(e.digest(e.cycles));
    const r = Engine.restore(s); r.run(100_000);
    assert.equal(JSON.stringify(r.digest(r.cycles)), live);
  });

  it('[API-010] API is synchronous (no Promise returned)', () => {
    const e = new Engine({ seed: 1 });
    assert.equal(e.inject(ANC) instanceof Promise, false);
    assert.equal((e.run(1000) as unknown) instanceof Promise, false);
    assert.equal((e.stats() as unknown) instanceof Promise, false);
  });

  it('[API-011] normalizeScenario fills the full slicer/malMode/mutation defaults (S6/S7/S8)', () => {
    const s = normalizeScenario({});
    assert.equal(s.slicer.sizeDependent, false); // S6
    assert.equal(s.slicer.sliceSize, 25);
    assert.equal(s.malMode, 'first-fit');         // S7
    assert.equal(s.mutation.flaw, 0); assert.equal(s.mutation.copy, 0); assert.equal(s.mutation.cosmic, 0);
    assert.equal(DEFAULT_SCENARIO.slicer.sizeDependent, false);
  });

  it('[API-012] inject stamps founderId (default 0)', () => {
    const e = new Engine({ seed: 1 });
    const a = e.inject(ANC, { founderId: 4 }); const b = e.inject(ANC);
    assert.equal(e.world.creatures.get(a)!.founderId, 4);
    assert.equal(e.world.creatures.get(b)!.founderId, 0);
  });
});
