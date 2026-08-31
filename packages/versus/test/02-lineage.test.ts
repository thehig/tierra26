// Lineage Attribution (LINEAGE) — engine-backed acceptance tests.
// Ref: docs/spec/versus/02-lineage-attribution.md §8. Keep 1:1 with the doc.
//
// Frames are obtained via the engine STATS seam `observe(world, topK, tank)`
// (the Engine facade has no `observe`), reading the per-founder census the engine
// maintains. Runs use TWO injected founders {1,2} with mutation ON so descendants
// drift in genotype yet stay attributable by founder.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../engine/src/index.ts';
import { observe, makeTank, type ObservationFrame } from '../../engine/src/stats.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';
import { attribute, playerPopulations, partitions, neutralPopulation } from '../src/lineage.ts';

const MUT = { flaw: 0, copy: 200, cosmic: 4000 };
const SOUP = 30_000;

/** Fresh engine with N founders injected (in order) and mutation on. */
function seed(founderIds: number[], s = 7): Engine {
  const e = new Engine({ seed: s, soupSize: SOUP, mutation: MUT });
  for (const fid of founderIds) e.inject(ANC, { founderId: fid });
  return e;
}

/** A two-founder {1,2} run evolved to saturation (reaper active) for `cycles` instructions. */
function twoFounders(s = 7, cycles = 400_000): Engine {
  const e = seed([1, 2], s);
  e.run(cycles);
  return e;
}

/** Read a frame via the engine STATS seam (pure observation of live tags). */
function frameOf(e: Engine): ObservationFrame {
  return observe(e.world, 16, makeTank(64, 48, e.world.config().soupSize));
}

describe('Lineage Attribution (LINEAGE)', () => {
  it('[LINEAGE-001] a creature has a founderId; injection stamps it; default is 0 (neutral)', () => {
    const e = new Engine({ seed: 1, soupSize: SOUP });
    const a = e.inject(ANC, { founderId: 1 });
    const b = e.inject(ANC, { founderId: 2 });
    const c = e.inject(ANC); // no opts → default neutral
    assert.equal(e.world.creatures.get(a)!.founderId, 1);
    assert.equal(e.world.creatures.get(b)!.founderId, 2);
    assert.equal(e.world.creatures.get(c)!.founderId, 0);
  });

  it('[LINEAGE-002] on divide, the daughter founderId equals the mother (VSINV-INHERIT)', () => {
    const e = twoFounders();
    assert.ok(e.world.births > 2, 'divides must have occurred'); // beyond the 2 injections
    // Every live creature is attributed to an injected founder; none drifts.
    for (const c of e.world.creatures.values()) {
      assert.ok(c.founderId === 1 || c.founderId === 2, `founder ${c.founderId} not in {1,2}`);
    }
    // The census carries counts only for {1,2}.
    for (const [id] of attribute(frameOf(e))) assert.ok(id === 1 || id === 2);
  });

  it('[LINEAGE-003] attribution is by founder, not genotype: a mutated descendant keeps its founder', () => {
    const e = twoFounders();
    // Mutation diverged the lineages into many genotypes...
    assert.ok(e.stats().genotypes > 1, 'mutation should produce >1 live genotype');
    // ...yet every creature — whatever its (mutated) genotype — stays in {1,2}.
    for (const c of e.world.creatures.values()) {
      assert.ok(c.founderId === 1 || c.founderId === 2);
    }
  });

  it('[LINEAGE-004] a creature descends to exactly one founder at any depth (no chain walk, dead-ancestor independent)', () => {
    const e = twoFounders();
    // The seed ancestors have long since been reaped, yet attribution survives.
    assert.ok(e.world.deaths > 0, 'ancestors/creatures must have been reaped');
    for (const c of e.world.creatures.values()) {
      // founderId is a single scalar id (exactly one founder), read in O(1) — no chain walk.
      assert.equal(typeof c.founderId, 'number');
      assert.ok(c.founderId === 1 || c.founderId === 2);
    }
  });

  it('[LINEAGE-005] a daughter produced while executing borrowed code is attributed by descent (mother founder)', () => {
    // Pre-saturation (before the reaper culls mothers) so live mother/daughter pairs coexist.
    const e = seed([1, 2]); e.run(150_000);
    // Two founders share one soup and execute across each other's cells; regardless of
    // whose code ran, each daughter's founder equals its (still-live) mother's — descent.
    let checked = 0;
    for (const c of e.world.creatures.values()) {
      const parent = e.world.creatures.get(c.parentId);
      if (parent) { assert.equal(c.founderId, parent.founderId); checked++; }
    }
    assert.ok(checked > 0, 'expected at least one live mother/daughter pair to verify');
    // Neutral (0) never appears despite cross-execution — no daughter drifts to unattributed.
    assert.equal(neutralPopulation(frameOf(e)), 0);
  });

  it('[LINEAGE-006] per-founder populations partition the live population: Σ + neutral == total every frame', () => {
    const e = seed([1, 2]);
    for (const target of [40_000, 120_000, 200_000]) {
      e.run(target - e.cycles);
      assert.equal(partitions(frameOf(e)), true, `partition must hold at cycle ${e.cycles}`);
    }
  });

  it('[LINEAGE-007] attribute(frame) is a pure read of frame tags (no recomputation from genomes)', () => {
    const e = twoFounders();
    const f = frameOf(e);
    const before = e.cycles;
    const a1 = attribute(f);
    const a2 = attribute(f);
    assert.deepEqual([...a1.entries()], [...a2.entries()]); // idempotent
    assert.equal(e.cycles, before); // reading a frame never advances the engine
  });

  it('[LINEAGE-008] the founder tag is simulation-inert: enabling scoring does not change a run digest (fidelity)', () => {
    // Same seed/genomes/placement: one run tagged {1,2}, one left all-neutral {0,0}.
    const scored = seed([1, 2]); scored.run(200_000);
    const neutral = seed([0, 0]); neutral.run(200_000);
    assert.equal(scored.cycles, neutral.cycles); // identical dynamics ⇒ identical clock
    assert.deepEqual(scored.digest(200_000), neutral.digest(200_000)); // tags don't touch the soup
  });

  it('[LINEAGE-009] reaping a creature decrements exactly its founder count', () => {
    // Drive to saturation so the reaper actively culls, then verify the census stays a
    // partition of the live population across steps — a mis-attributed decrement would
    // make Σcounts drift from population.
    const e = twoFounders(7, 400_000);
    assert.ok(e.world.deaths > 0, 'reaper must have culled at saturation');
    for (let i = 0; i < 5; i++) {
      e.run(20_000);
      const f = frameOf(e);
      assert.equal(partitions(f), true);
      // Σ per-founder counts == live population, event after event.
      let sum = 0; for (const v of attribute(f).values()) sum += v;
      assert.equal(sum, f.stats.population);
    }
  });

  it('[LINEAGE-010] neutral (founder 0) creatures are excluded from player scoring', () => {
    // Seed a neutral ancestor alongside the two players.
    const e = seed([0, 1, 2]);
    e.run(150_000);
    const f = frameOf(e);
    const attr = attribute(f);
    const players = playerPopulations(f);
    assert.equal(players.has(0), false); // neutral never scores
    if (neutralPopulation(f) > 0) assert.equal(attr.get(0), neutralPopulation(f)); // but IS attributed
    // players + neutral reconstruct the whole census total.
    let ps = 0; for (const v of players.values()) ps += v;
    assert.equal(ps + neutralPopulation(f), f.founders.total);
  });
});
