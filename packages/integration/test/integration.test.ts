// Cross-package integration invariants (INT-*). Engine-level ones are real (they import the
// real @tierra26/engine via relative path); the ones needing genescript/content/ui/versus src
// remain pending until those packages implement.
// Ref: docs/spec/validation/C-test-coverage-gaps.md §3.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, type RunDescriptor } from '../../engine/src/index.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';

const dig = (e: Engine) => JSON.stringify(e.digest(e.cycles));

describe('Cross-package integration (INT)', () => {
  it('[INT-ANCESTOR-GOLDEN] 0080aaa breeds true sterile and matches a pinned RunDigest (S11)', () => {
    const e = new Engine({ seed: 42, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(ANC, { founderId: 1 }); e.run(1_000_000);
    const d = e.digest(e.cycles);
    assert.equal(d.genotypes, 1);            // breeds true
    assert.ok(d.births > 100);
    assert.deepEqual(d, { atCycle: 1_000_000, population: 351, genotypes: 1, births: 839, deaths: 488, soupChecksum: 3717516734 });
  });

  it('[INT-SNAPSHOT-REPLAY-E2E] live == replay == restore digest (mutation on)', () => {
    const scenario = { seed: 5, mutation: { flaw: 0, copy: 200, cosmic: 4000 } } as any;
    const live = new Engine(scenario); live.inject(ANC, { founderId: 1 }); live.run(600_000);
    const desc: RunDescriptor = { engineVersion: Engine.version, scenario, injections: [{ atCycle: 0, genome: ANC, founderId: 1 }], cycles: 600_000 };
    const replay = Engine.replay(desc);
    assert.equal(dig(replay), dig(live));
    // restore mid-run and continue
    const e2 = new Engine(scenario); e2.inject(ANC, { founderId: 1 }); e2.run(300_000);
    const s = e2.snapshot(); e2.run(300_000);
    const r = Engine.restore(s); r.run(300_000);
    assert.equal(dig(r), dig(e2));
  });

  it('[INT-FOUNDER-ATTRIB-MUTATION] per-founder census partitions population under mutation', () => {
    const e = new Engine({ seed: 9, soupSize: 20000, mutation: { flaw: 0, copy: 300, cosmic: 5000 } });
    e.inject(ANC, { founderId: 1 });
    e.inject(ANC, { founderId: 2 });
    e.run(1_000_000);
    let sum = 0; for (const c of e.world.creatures.values()) { assert.ok(c.founderId === 1 || c.founderId === 2); }
    for (const x of e.world.founders) sum += x;
    assert.equal(sum, e.world.creatures.size);        // partition (VSINV-ATTRIB)
    assert.equal(e.world.founders[1]! + e.world.founders[2]!, e.world.creatures.size);
  });

  // Pending — need genescript/content/ui/versus src:
  it.todo('[INT-EDITOR-ENGINE] compile(GeneScript) bytes == injected == inspector disassembly');
  it.todo('[INT-GS-ANCESTOR] the GeneScript ancestor compiles to a genome that breeds true');
  it.todo('[INT-CONTENT-COMPILE] every shipped starter genome compiles under its subset + loads');
  it.todo('[INT-FRAME-VIEWS] one ObservationFrame feeds tank/charts/inspector consistently');
  it.todo('[INT-SUBSET-PORTABLE] a named subset emits identical bytes across content→genescript→engine');
  it.todo('[INT-GOAL-DETERMINISM] a content goal-checker verdict is identical across same-seed runs');
  it.todo('[INT-VERSUS-MATCH-REPLAY] a MatchDescriptor replays identical standings + result');
});
