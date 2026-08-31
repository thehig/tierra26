// Versus cross-layer invariants (VSINV).
// Ref: docs/spec/versus/00-overview.md §6.
// These tie the runner + scoring + lineage to the real engine (via the UI worker) and prove
// the fairness/attribution guarantees hold end-to-end.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDescriptor, toRunDescriptor, runMatch } from '../src/runner.ts';
import { partitions, attribute } from '../src/lineage.ts';
import type { MatchConfig, Player } from '../src/types.ts';

import { Engine, normalizeScenario } from '../../engine/src/index.ts';
import { observe, makeTank } from '../../engine/src/stats.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';

const breeder = ANCESTOR_GS;
const inert = 'here:\njump-back here'; // a self-loop: never wanders, never reproduces

const mkConfig = (over: Partial<MatchConfig> = {}, players?: Player[]): MatchConfig => ({
  scenario: normalizeScenario({ soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } }),
  seed: 1,
  players: players ?? [
    { founderId: 1, name: 'A', genome: breeder },
    { founderId: 2, name: 'B', genome: inert },
  ],
  rules: { threshold: { kind: 'cycles', value: 300_000 }, tiebreakers: ['peak-population'] },
  ...over,
});

describe('Versus cross-layer invariants (VSINV)', () => {
  it('[VSINV-DET] the same MatchDescriptor yields identical standings and result for any viewer', async () => {
    const desc = buildDescriptor(mkConfig());
    const r1 = await runMatch(desc).result;
    const r2 = await runMatch(desc).result;
    assert.deepEqual(r1.standings, r2.standings);
    assert.equal(r1.winner, r2.winner);
    assert.equal(r1.atCycle, r2.atCycle);
    assert.equal(r1.winner, 1); // the breeder beats the self-loop
  });

  it('[VSINV-SIMULTANEOUS] every player genome is present at cycle 0; the first instruction sees all founders placed', () => {
    const desc = buildDescriptor(mkConfig());
    const run = toRunDescriptor(desc);
    // every player injects at cycle 0 (simultaneous), one injection per player
    assert.equal(run.injections.length, desc.players.length);
    for (const inj of run.injections) assert.equal(inj.atCycle, 0);
    assert.deepEqual([...run.injections.map((i) => i.founderId)].sort(), [1, 2]);
    // the runner's first LiveStanding (cycle 0, before any instruction) lists both founders alive
    const m = runMatch(desc);
    const first = m.standings$[0]!;
    assert.equal(first.cycle, 0);
    assert.deepEqual(first.standings.map((s) => s.founderId).sort(), [1, 2]);
    for (const s of first.standings) assert.ok(s.population >= 1, 'each founder placed at cycle 0');
  });

  it('[VSINV-ATTRIB] per-founder populations + neutral == total population at every frame (partition)', () => {
    const e = new Engine({ seed: 3, soupSize: 30000, mutation: { flaw: 0, copy: 200, cosmic: 4000 } });
    const tank = makeTank(64, 48, 30000);
    e.inject(ANC(), { founderId: 1 });
    e.inject(ANC(), { founderId: 2 });
    for (let i = 0; i < 6; i++) {
      e.run(60_000);
      const frame = observe(e.world, 16, tank);
      assert.ok(partitions(frame), `partition holds at cycle ${e.cycles}`);
      let sum = 0; for (const [, n] of attribute(frame)) sum += n;
      assert.equal(sum, frame.stats.population, 'Σ per-founder (incl neutral) == live population');
    }
  });

  it('[VSINV-INHERIT] a daughter founderId equals its mother for every birth (attribution survives genotype drift)', () => {
    const e = new Engine({ seed: 9, soupSize: 30000, mutation: { flaw: 0, copy: 200, cosmic: 4000 } });
    e.inject(ANC(), { founderId: 1 });
    e.inject(ANC(), { founderId: 2 });
    e.run(200_000);
    assert.ok(e.stats().genotypes > 1, 'mutation produced genotype drift');
    for (const c of e.world.creatures.values()) {
      assert.ok(c.founderId === 1 || c.founderId === 2, 'no creature drifted off its founder');
      const parent = e.world.creatures.get(c.parentId);
      if (parent) assert.equal(c.founderId, parent.founderId, 'daughter founderId === mother');
    }
  });

  it('[VSINV-MIRROR-SEED] over best-of-N rotation a mirror match favors no player beyond seed noise (fairness)', async () => {
    // Identical genomes for both players: any systematic winner would be a slot bias, not skill.
    const winners: (number | 'draw')[] = [];
    for (let s = 1; s <= 8; s++) {
      const desc = buildDescriptor(mkConfig({ seed: s }, [
        { founderId: 1, name: 'A', genome: breeder },
        { founderId: 2, name: 'B', genome: breeder },
      ]));
      winners.push((await runMatch(desc).result).winner);
    }
    // no single founder sweeps every seed — the seed-derived injection order de-biases the slot
    const allFounder1 = winners.every((w) => w === 1);
    const allFounder2 = winners.every((w) => w === 2);
    assert.equal(allFounder1, false, 'founder 1 does not win every mirror seed');
    assert.equal(allFounder2, false, 'founder 2 does not win every mirror seed');
  });
});

// The engine ancestor fixture bytes (a guaranteed breeder) for the attribution proofs.
import { ANCESTOR_0080AAA } from '../../engine/test/fixtures/ancestor-0080aaa.ts';
function ANC(): Uint8Array { return ANCESTOR_0080AAA.slice(); }
