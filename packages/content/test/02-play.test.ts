// Playground Component (PLAY) — acceptance criteria.
// Ref: docs/spec/content/02-playground-component.md §8.
// One it(...) per PLAY-NNN criterion; criterion text preserved verbatim from the spec.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePlayground,
  toRunDescriptor,
  serializeConfig,
  deserializeConfig,
  createPlayground,
  sourceMappedGenome,
  PlaygroundError,
  OBS,
} from '../src/play.ts';
import type { PlaygroundConfig } from '../src/types.ts';
import { Engine, classic32, buildSubset } from '../../engine/src/index.ts';
import { observe, makeTank } from '../../engine/src/stats.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { compile } from '../../genescript/src/comp.ts';
import type { ObservationFrame } from '../../engine/src/stats.ts';

// A comparable, byte-level fingerprint of an ObservationFrame (typed-array-safe).
function frameKey(f: ObservationFrame): string {
  return JSON.stringify({
    cycles: f.cycles,
    stats: f.stats,
    top: f.topGenotypes,
    size: f.sizeHist,
    cells: [...f.tank.cells],
    geno: [...f.tank.genotypeOf],
    ips: [...f.tank.ips],
    founders: [...f.founders.counts],
    tank: { w: f.tank.width, h: f.tank.height, b: f.tank.bucketBytes },
  });
}

// A minimal, deterministic, compiling starter (gene names → incA, incB, divide).
const STARTER = 'grow-a\ngrow-b\ndivide';

function baseConfig(over: Partial<PlaygroundConfig> = {}): PlaygroundConfig {
  return {
    scenario: {},
    seed: 12345,
    starter: { kind: 'genescript', source: STARTER },
    subset: { kind: 'classic32' },
    cycles: 400,
    ...over,
  };
}

// Observe an independent engine built from the same config, advanced by run(n).
function refFrame(cfg: PlaygroundConfig, runN: number): ObservationFrame {
  const norm = normalizePlayground(cfg);
  const e = new Engine(norm.scenario);
  e.inject(norm.starter.bytes, { founderId: 1 });
  if (runN > 0) e.run(runN);
  return observe(e.world, OBS.topK, makeTank(OBS.width, OBS.height, e.scenario.soupSize));
}

describe('Playground Component (PLAY)', () => {
  it('[PLAY-001] same PlaygroundConfig (scenario+seed+starter+subset) => byte-identical ObservationFrame stream at every cycle; replay(toRunDescriptor(cfg)) reproduces the run bit-for-bit (C-CON-DET / INV-REPLAY)', () => {
    const cfg = baseConfig();
    const a = createPlayground(cfg);
    const b = createPlayground(cfg);
    // Byte-identical frame stream at every step, in lockstep.
    for (let i = 0; i < 40; i++) {
      assert.equal(frameKey(a.state.frame), frameKey(b.state.frame));
      a.stepInstruction();
      b.stepInstruction();
    }
    // replay(toRunDescriptor(cfg)) reproduces the run bit-for-bit.
    const norm = normalizePlayground(cfg);
    const rep = Engine.replay(toRunDescriptor(norm));
    const c = createPlayground(cfg);
    c.runTo(cfg.cycles!); // whole-slice run(N), exactly as replay runs run(cycles)
    const replayFrame = observe(rep.world, OBS.topK, makeTank(OBS.width, OBS.height, rep.scenario.soupSize));
    assert.equal(rep.cycles, c.state.cycle);
    assert.equal(frameKey(replayFrame), frameKey(c.state.frame));
  });

  it('[PLAY-002] config is serializable & shareable: deserializeConfig(serializeConfig(cfg)) deep-equals cfg, is pure data, and two processes deserializing it produce identical runs (C-CON-DATA)', () => {
    const cfg = baseConfig({ goal: { id: 'g', kind: 'reach-pop', params: { population: 1 }, tier: 'required', title: 'Live!' } });
    const wire = serializeConfig(cfg);
    assert.equal(typeof wire, 'string');
    const back = deserializeConfig(wire);
    assert.deepEqual(back, cfg); // round-trips
    // pure data: no function survives JSON; the parsed value is a plain object tree.
    assert.equal(JSON.stringify(JSON.parse(wire)), wire);
    // Two independent "processes" deserialize the same string → identical runs.
    const p1 = createPlayground(deserializeConfig(wire));
    const p2 = createPlayground(deserializeConfig(wire));
    for (let i = 0; i < 25; i++) { p1.stepInstruction(); p2.stepInstruction(); }
    assert.equal(frameKey(p1.state.frame), frameKey(p2.state.frame));
  });

  it('[PLAY-003] reset() returns to the EXACT initial state: cycle == 0 and a frame byte-identical to a brand-new build from the same config (not a rewind of a used engine)', () => {
    const cfg = baseConfig();
    const initial = frameKey(createPlayground(cfg).state.frame);
    const pg = createPlayground(cfg);
    pg.stepInstruction();
    pg.runTo(120);
    pg.injectEdited('grow-a\ndivide');
    assert.notEqual(frameKey(pg.state.frame), initial); // it really moved
    pg.reset();
    assert.equal(pg.state.cycle, 0);
    assert.equal(frameKey(pg.state.frame), initial); // byte-identical to a brand-new build
  });

  it('[PLAY-004] stepInstruction() advances cycle by exactly 1 (engine.step); runTo(N) leaves cycle in [N, N + maxSliceSize) (whole-slice engine.run)', () => {
    const pg = createPlayground(baseConfig());
    assert.equal(pg.state.cycle, 0);
    pg.stepInstruction();
    assert.equal(pg.state.cycle, 1);
    pg.stepInstruction();
    assert.equal(pg.state.cycle, 2);
    pg.reset();
    const N = 200;
    pg.runTo(N);
    // default sliceSize 25 → a slice runs [0, 2*25] instructions, so overshoot < 2*25+1.
    assert.ok(pg.state.cycle >= N, `cycle ${pg.state.cycle} >= ${N}`);
    assert.ok(pg.state.cycle < N + 51, `cycle ${pg.state.cycle} < ${N + 51}`);
  });

  it('[PLAY-005] exposed state.frame equals the engine observe()/stats() output at the current cycle (population/births/deaths/genotypes/fullness/tank) — streamed unchanged', () => {
    const cfg = baseConfig();
    const pg = createPlayground(cfg);
    // At cycle 0 the exposed frame equals an independent engine's observe() output.
    assert.equal(frameKey(pg.state.frame), frameKey(refFrame(cfg, 0)));
    pg.runTo(150);
    assert.equal(frameKey(pg.state.frame), frameKey(refFrame(cfg, 150)));
    // the frame carries the engine's real stats, unchanged.
    const f = pg.state.frame;
    assert.equal(typeof f.stats.population, 'number');
    assert.ok(f.stats.births >= 1);
  });

  it('[PLAY-006] selectVariant(id) swaps to that variant\'s starter (compiled under the same subset), resets to cycle 0, and the same variant id always yields the same run (deterministic)', () => {
    const cfg = baseConfig({
      variants: [{ id: 'v2', label: 'Grow B first', starter: { kind: 'genescript', source: 'grow-b\ngrow-b\ndivide' } }],
    });
    const pg = createPlayground(cfg);
    const defaultBytes = [...pg.state.genome.bytes];
    pg.selectVariant('v2');
    assert.equal(pg.state.cycle, 0); // resets to cycle 0
    assert.equal(pg.state.activeVariantId, 'v2');
    assert.equal(pg.state.genome.source, 'grow-b\ngrow-b\ndivide'); // starter swapped
    assert.notDeepEqual([...pg.state.genome.bytes], defaultBytes); // a real, different starter, compiled under the same subset
    pg.runTo(200);
    const variantKey = frameKey(pg.state.frame);
    // same variant id → same run, always (deterministic).
    const pg2 = createPlayground(cfg);
    pg2.selectVariant('v2');
    pg2.runTo(200);
    assert.equal(frameKey(pg2.state.frame), variantKey);
  });

  it('[PLAY-007] goal status is queryable & deterministic: state.goal exposes pass/fail/progress per seed at the current cycle, and is undefined when no goal is configured (C-CON-DET, [06])', () => {
    const withGoal = baseConfig({ goal: { id: 'live', kind: 'reach-pop', params: { population: 1 }, tier: 'required', title: 'Stay alive' } });
    const pg = createPlayground(withGoal);
    const g = pg.state.goal;
    assert.ok(g, 'goal is queryable');
    assert.equal(g!.goalId, 'live');
    assert.equal(g!.passed, true); // one founder injected → population 1
    assert.equal(g!.measured, 1);
    assert.equal(g!.atCycle, 0);
    assert.equal(typeof g!.progress, 'number');
    // deterministic per seed at the same cycle.
    const pg2 = createPlayground(withGoal);
    pg.runTo(100); pg2.runTo(100);
    assert.deepEqual(pg.state.goal, pg2.state.goal);
    // undefined when no goal.
    assert.equal(createPlayground(baseConfig()).state.goal, undefined);
  });

  it('[PLAY-008] starter (and every variant/solution) compiles under the active subset and loads in the engine (C-CON-COMPILES); a verb outside the subset fails normalization with a kid-friendly diagnostic (C-CON-SUBSET)', () => {
    const subset = { kind: 'subset', name: 'mini', verbs: ['grow-a', 'grow-b', 'divide'] } as const;
    const good = baseConfig({
      subset,
      starter: { kind: 'genescript', source: 'grow-a\ndivide' },
      variants: [{ id: 'v', label: 'B', starter: { kind: 'genescript', source: 'grow-b\ndivide' } }],
    });
    const norm = normalizePlayground(good);
    assert.ok(norm.starter.bytes.length > 0);
    // loads in the engine with no illegal-opcode error.
    const e = new Engine(norm.scenario);
    assert.ok(e.inject(norm.starter.bytes, { founderId: 1 }) >= 0);
    // a verb outside the subset fails normalization with a kid-friendly diagnostic.
    const bad = baseConfig({ subset, starter: { kind: 'genescript', source: 'copy-byte\ndivide' } });
    assert.throws(
      () => normalizePlayground(bad),
      (err: unknown) => {
        assert.ok(err instanceof PlaygroundError);
        const d = (err as PlaygroundError).diagnostics;
        assert.ok(d.some((x) => x.code === 'verb-not-in-subset'));
        assert.ok(d.every((x) => typeof x.message === 'string' && x.message.length > 0));
        return true;
      },
    );
  });

  it('[PLAY-009] injectEdited(source) returns {ok:true,creatureId} for subset-valid GeneScript (loaded via engine.inject) and {ok:false,diagnostics} — engine untouched — for uncompilable/gated code (C-CON-COMPILES / C-CON-SUBSET)', () => {
    const pg = createPlayground(baseConfig({ subset: { kind: 'subset', name: 'mini', verbs: ['grow-a', 'grow-b', 'divide'] } }));
    const popBefore = pg.state.frame.stats.population;
    const ok = pg.injectEdited('grow-a\ndivide');
    assert.equal(ok.ok, true);
    if (ok.ok) assert.ok(ok.creatureId >= 0);
    assert.equal(pg.state.frame.stats.population, popBefore + 1);
    // gated / uncompilable code changes nothing.
    const before = frameKey(pg.state.frame);
    const bad = pg.injectEdited('copy-byte'); // gated verb under this subset
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.ok(bad.diagnostics.length > 0);
    assert.equal(frameKey(pg.state.frame), before); // engine untouched
    const garbage = pg.injectEdited('wiggle-around'); // not a verb at all
    assert.equal(garbage.ok, false);
    assert.equal(frameKey(pg.state.frame), before);
  });

  it('[PLAY-010] display options never affect the run: changing panels/setSpeed/spotlight yields the same ObservationFrame stream and is absent from toRunDescriptor(cfg) (C-CON-DET)', () => {
    const plain = baseConfig();
    const fancy = baseConfig({ display: { panels: ['soup', 'tank', 'goal'], speedDefault: 'max', spotlight: { instruction: 'grow-a', line: 1 } } });
    const a = createPlayground(plain);
    const b = createPlayground(fancy);
    b.setSpeed('slow'); b.setPanels(['stats']); b.setSpotlight({ line: 2 });
    for (let i = 0; i < 30; i++) {
      assert.equal(frameKey(a.state.frame), frameKey(b.state.frame));
      a.stepInstruction(); b.stepInstruction();
    }
    // display is absent from the RunDescriptor recipe.
    const desc = toRunDescriptor(normalizePlayground(fancy));
    assert.deepEqual(Object.keys(desc).sort(), ['cycles', 'engineVersion', 'injections', 'scenario']);
    assert.ok(!('display' in desc));
    const wire = JSON.stringify(desc, (_k, v) => (v instanceof Uint8Array ? [...v] : v));
    assert.ok(!/panels|spotlight|speed/.test(wire));
  });

  it('[PLAY-011] peek-under-hood exposes a source-mapped genome (source + bytes + line<->byte map, GSINV-SOURCEMAP); an edited/evolved genome with no authored source uses the disassembly (GeneScript §5)', () => {
    const pg = createPlayground(baseConfig());
    const g = pg.state.genome;
    assert.equal(g.source, STARTER); // authored source preserved
    assert.ok(g.bytes.length > 0);
    assert.ok(g.map.length > 0);
    assert.equal(g.map[0]!.line, 1);
    for (const m of g.map) assert.ok(m.byteStart < m.byteEnd);
    // an edited/evolved genome with no authored source uses the disassembly.
    const bytes = compile(STARTER, classic32).bytes;
    const dis = sourceMappedGenome(bytes, classic32);
    assert.equal(dis.source, disassemble(bytes, classic32).source);
    assert.equal(dis.map[0]!.byteStart, 0);
    assert.equal(dis.map[dis.map.length - 1]!.byteEnd, bytes.length); // tiles the whole genome
  });

  it('[PLAY-012] it drives a real @tierra26/engine (step/run/inject) and two playgrounds on one page run independently with no shared module-level state (rests on API-010 / C-SNAP)', () => {
    const a = createPlayground(baseConfig({ seed: 1 }));
    const b = createPlayground(baseConfig({ seed: 999 }));
    // it drives a real engine: step is a real single-instruction advance.
    assert.ok(a.normalized.subset === classic32 || a.normalized.subset.name === 'classic32');
    const bKeyBefore = frameKey(b.state.frame);
    a.runTo(300); // advance A only
    assert.ok(a.state.cycle >= 300);
    // advancing A does not change B's frames — no shared module-level state.
    assert.equal(frameKey(b.state.frame), bKeyBefore);
    // and B still advances on its own engine.
    b.stepInstruction();
    assert.equal(b.state.cycle, 1);
    assert.equal(a.state.cycle >= 300, true);
  });

  it('[PLAY-013] contract, not renderer: the module exposes only data (PlaygroundConfig/PlaygroundState) + behavior (PlaygroundControls) and references no DOM/host global (mirrors API-006)', () => {
    const src = readFileSync(new URL('../src/play.ts', import.meta.url), 'utf8');
    // strip line comments so prose never trips the assertion; check real references.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\bwindow\b/.test(code), 'no window');
    assert.ok(!/\bdocument\b/.test(code), 'no document');
    assert.ok(!/\bglobalThis\b/.test(code), 'no globalThis');
    assert.ok(!/\blocalStorage\b/.test(code), 'no localStorage');
    assert.ok(!/\bself\b/.test(code), 'no self');
    // it exposes data + behavior (a drivable contract), not pixels.
    const pg = createPlayground(baseConfig());
    assert.equal(typeof pg.stepInstruction, 'function');
    assert.equal(typeof pg.injectEdited, 'function');
    assert.equal(typeof pg.state.frame, 'object');
  });
});
