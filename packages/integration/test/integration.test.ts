// Cross-package integration invariants (INT-*). Engine-level ones are real (they import the
// real @tierra26/engine via relative path); the ones needing genescript/content/ui/versus src
// remain pending until those packages implement.
// Ref: docs/spec/validation/C-test-coverage-gaps.md §3.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, type RunDescriptor } from '../../engine/src/index.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';
import { compile } from '../../genescript/src/comp.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';
import { hasErrors } from '../../genescript/src/types.ts';

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

  it('[INT-EDITOR-ENGINE] compile(GeneScript) bytes == injected == disassembly (one genome, three views)', () => {
    const src = 'top:\ngrow-a\ncopy-byte\njump-back top\nmake-space\ndivide';
    const compiled = compile(src, classic32).bytes;
    const e = new Engine({ seed: 1 });
    const id = e.inject(compiled, { founderId: 1 });
    const c = e.world.creatures.get(id)!;
    const injected = new Uint8Array(c.size);
    for (let i = 0; i < c.size; i++) injected[i] = e.world.soup.read(c.start + i);
    assert.deepEqual([...injected], [...compiled]);                    // editor == injected
    // disassembling the injected genome recompiles to the same bytes (peek-under-hood consistency)
    const recompiled = compile(disassemble(injected, classic32).source, classic32).bytes;
    assert.deepEqual([...compile(disassemble(recompiled, classic32).source, classic32).bytes], [...recompiled]);
  });

  it('[INT-GS-ANCESTOR] the GeneScript ancestor compiles to a genome that breeds true (GSINV-ANCESTOR)', () => {
    const r = compile(ANCESTOR_GS, classic32);
    assert.equal(hasErrors(r.diagnostics), false);
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(r.bytes, { founderId: 1 }); e.run(400_000);
    assert.equal(e.stats().genotypes, 1);      // breeds true through the compiler
    assert.ok(e.stats().births > 20);
  });

  it('[INT-SUBSET-PORTABLE] a named subset emits identical bytes across compiles (S10)', () => {
    const sub = buildSubset('ch', ['movii', 'incA', 'jmpb', 'mal', 'divide']);
    const src = 'grow-a\ncopy-byte\nmake-space\ndivide';
    const a = compile(src, sub).bytes, b = compile(src, sub).bytes;
    assert.deepEqual([...a], [...b]);           // deterministic + portable under the subset
    for (const byte of a) assert.ok(byte >= 0 && byte < sub.n);
  });

  // Content layer wired (@tierra26/content):
  it('[INT-CONTENT-COMPILE] every shipped starter genome compiles under its subset + loads', async () => {
    const { STARTERS } = await import('../../content/src/lessons.ts');
    const { normalizePlayground } = await import('../../content/src/play.ts');
    let n = 0;
    for (const [id, s] of Object.entries(STARTERS)) {
      // normalizePlayground compiles the starter under its subset and verifies it loads.
      const norm = normalizePlayground({
        scenario: { seed: 1 }, seed: 1,
        starter: { kind: 'genescript', source: s.source }, subset: s.subset,
      });
      assert.ok(norm.starter.bytes.length > 0, `starter ${id} compiled to bytes`);
      const e = new Engine({ seed: 1, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
      assert.doesNotThrow(() => e.inject(norm.starter.bytes, { founderId: 1 }), `starter ${id} loads`);
      n++;
    }
    assert.ok(n > 0, 'at least one shipped starter');
  });

  it('[INT-SUBSET-PORTABLE] a named subset emits identical bytes across content→genescript→engine', async () => {
    const { normalizePlayground, toRunDescriptor } = await import('../../content/src/play.ts');
    // A content PlaygroundConfig naming a subset → genescript compile → engine load, twice.
    const cfg = {
      scenario: { seed: 2 }, seed: 2,
      starter: { kind: 'genescript' as const, source: 'grow-a\ncopy-byte\nmake-space\ndivide' },
      subset: { kind: 'subset' as const, name: 'ch', verbs: ['movii', 'incA', 'mal', 'divide'] },
    };
    const a = normalizePlayground(cfg), b = normalizePlayground(cfg);
    assert.deepEqual([...a.starter.bytes], [...b.starter.bytes]); // deterministic + portable
    for (const byte of a.starter.bytes) assert.ok(byte >= 0 && byte < a.subset.n, 'legal under the subset');
    // the same recipe replays bit-for-bit through the engine
    const d1 = Engine.replay(toRunDescriptor(a)); const d2 = Engine.replay(toRunDescriptor(b));
    assert.equal(dig(d1), dig(d2));
  });

  it('[INT-GOAL-DETERMINISM] a content goal-checker verdict is identical across same-seed runs', async () => {
    const { checkGoal } = await import('../../content/src/goal.ts');
    const goal = { id: 'g', kind: 'replicates' as const, params: { within: 5000 }, tier: 'required' as const, title: 'baby' };
    const ctx = { scenario: { seed: 4 }, seed: 4, genome: ANC, maxCycles: 200_000 };
    const r1 = checkGoal(goal, ctx); const r2 = checkGoal(goal, ctx);
    assert.deepEqual(r1, r2);              // byte-identical verdict (passed/measured/atCycle/hint)
    assert.equal(r1.passed, true);          // the ancestor replicates
  });

  // UI layer wired (@tierra26/ui): one worker frame feeds every view-model consistently.
  it('[INT-FRAME-VIEWS] one ObservationFrame feeds tank/charts/inspector consistently', async () => {
    const { createWorkerCore } = await import('../../ui/src/worker-core.ts');
    const { tankFrameFromObservation, addressToCell } = await import('../../ui/src/tank-view.ts');
    const { makeChartModel } = await import('../../ui/src/charts.ts');
    let s = 0; const env = () => ({ sessionId: 'v', correlationId: `k${s++}` });
    const core = createWorkerCore();
    core.handle({ type: 'createSession', engineVersion: Engine.version, ...env() } as any);
    core.handle({ type: 'init', scenario: { seed: 1, mutation: { flaw: 0, copy: 0, cosmic: 0 } }, ...env() } as any);
    core.handle({ type: 'inject', genome: ANC.slice(), ...env() } as any);
    core.handle({ type: 'run', mode: 'budget', nInstructions: 400_000, ...env() } as any);
    const evs = core.handle({ type: 'step', ...env() } as any);
    const frame = (evs.find((e: any) => e.type === 'frame') as any).frame;

    // charts reads the SAME population the frame carries
    const chart = makeChartModel(); chart.ingest(frame);
    assert.equal(chart.readouts.population, frame.stats.population);
    assert.ok(frame.stats.population > 1, 'the ancestor has replicated by now');

    // tank spatial map agrees with the census: some cells are occupied
    const tf = tankFrameFromObservation(frame);
    let occupied = 0; for (const g of tf.genotypeOf) if (g !== 0) occupied++;
    assert.ok(occupied > 0, 'the tank shows living cells');

    // inspector view of a live address agrees with the tank cell's genotype at that address
    const insp = core.handle({ type: 'requestInspect', addr: 0, ...env() } as any).find((e: any) => e.type === 'inspectResult') as any;
    if (insp && insp.view.occupied) {
      const { x, y } = addressToCell(0, tf);
      const cellGeno = tf.genotypeOf[y * tf.width + x];
      assert.equal(cellGeno, insp.view.genotypeId, 'tank cell genotype === inspector genotypeId (one frame, consistent views)');
    }
  });

  // Versus layer wired (@tierra26/versus):
  it('[INT-VERSUS-MATCH-REPLAY] a MatchDescriptor replays identical standings + result', async () => {
    const { buildDescriptor, toRunDescriptor, runMatch } = await import('../../versus/src/runner.ts');
    const { normalizeScenario } = await import('../../engine/src/index.ts');
    const { ANCESTOR_GS } = await import('../../genescript/src/ancestor.gs.ts');
    const cfg = {
      scenario: normalizeScenario({ soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } }),
      seed: 7,
      players: [
        { founderId: 1, name: 'A', genome: ANCESTOR_GS },
        { founderId: 2, name: 'B', genome: 'here:\njump-back here' },
      ],
      rules: { threshold: { kind: 'cycles' as const, value: 300_000 }, tiebreakers: ['peak-population' as const] },
    };
    const desc = buildDescriptor(cfg);
    // two viewers of the same descriptor see identical standings + result (VSINV-DET)
    const r1 = await runMatch(desc).result;
    const r2 = await runMatch(desc).result;
    assert.deepEqual(r1.standings, r2.standings);
    assert.equal(r1.winner, r2.winner);
    // the descriptor derives a valid RunDescriptor that the engine replays to the same stop cycle
    const run = toRunDescriptor(desc);
    assert.ok(run.injections.every((i: any) => i.atCycle === 0)); // simultaneous
    const replay = Engine.replay(run);
    assert.equal(replay.cycles, r1.atCycle, 'engine replay reaches the match stop cycle');
    assert.equal(r1.winner, 1);
  });
});
