// Charts & Readouts (CHARTS) — real tests. Ref: docs/spec/ui/05-charts-and-readouts.md §8.
// Drives the pure view-model (src/charts.ts) with synthetic ObservationFrames and,
// where the histogram-sum / source invariants demand real data, a real Engine frame.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeSeries, makeChartModel } from '../src/charts.ts';
import type { ObservationFrame, HistBin } from '../src/protocol.ts';
import { Engine } from '../../engine/src/index.ts';
import { observe, makeTank } from '../../engine/src/stats.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';

// ---- synthetic frame builder (tank/founders are inert stubs; ingest ignores them) ----
interface FrameInit {
  cycles: number;
  population: number;
  genotypes: number;
  births?: number;
  deaths?: number;
  avgSize?: number;
  generations?: number;
  fullness?: number;
  topGenotypes?: HistBin[];
  sizeHist?: HistBin[];
}
function frame(init: FrameInit): ObservationFrame {
  const stats = {
    cycles: init.cycles,
    population: init.population,
    genotypes: init.genotypes,
    births: init.births ?? 0,
    deaths: init.deaths ?? 0,
    avgSize: init.avgSize ?? 0,
    generations: init.generations ?? 0,
    fullness: init.fullness ?? 0,
  };
  const tank = { width: 0, height: 0, bucketBytes: 0, cells: new Uint8Array(0), genotypeOf: new Uint32Array(0), ips: new Uint32Array(0) };
  const founders = { counts: new Uint32Array(0), total: 0 };
  return {
    cycles: init.cycles,
    stats,
    topGenotypes: init.topGenotypes ?? [],
    sizeHist: init.sizeHist ?? [],
    tank,
    founders,
  } as unknown as ObservationFrame;
}
function bins(pairs: [number, number][]): HistBin[] {
  return pairs.map(([key, count]) => ({ key, label: String(key), count }));
}
// A reproducible synthetic frame stream (deterministic; no clock/RNG).
function stream(n: number): ObservationFrame[] {
  const out: ObservationFrame[] = [];
  for (let i = 0; i < n; i++) {
    const cyc = (i + 1) * 10;
    out.push(frame({
      cycles: cyc,
      population: 100 + i,
      genotypes: 1 + (i % 3),
      births: i,
      deaths: (i / 2) | 0,
      avgSize: 80,
      fullness: (i % 100) / 100,
      topGenotypes: bins([[1, 100 + i], [2, 50 - (i % 5)]]),
      sizeHist: bins([[80, 100 + i]]),
    }));
  }
  return out;
}
function realFrame(seed: number, cycles: number): ObservationFrame {
  const e = new Engine({ seed, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
  e.inject(ANC, { founderId: 1 });
  e.run(cycles);
  const tank = makeTank(20, 20, e.world.config().soupSize);
  return observe(e.world, 8, tank);
}

describe('Charts & Readouts (CHARTS)', () => {
  it('[CHARTS-001] ingest is a pure function of the frame sequence — no clock/RNG', () => {
    const frames = stream(20);
    const a = makeChartModel(8);
    const b = makeChartModel(8);
    for (const f of frames) a.ingest(f);
    for (const f of frames) b.ingest(f);
    assert.deepEqual(a.population.points(), b.population.points());
    assert.deepEqual(a.genotypes.points(), b.genotypes.points());
    assert.deepEqual(a.sizeHistogram, b.sizeHistogram);
    assert.deepEqual(a.readouts, b.readouts);
    assert.deepEqual([...a.perGenotype.keys()], [...b.perGenotype.keys()]);
    for (const k of a.perGenotype.keys()) {
      assert.deepEqual(a.perGenotype.get(k)!.points(), b.perGenotype.get(k)!.points());
    }
  });

  it('[CHARTS-002] appending frames builds the population series keyed by cycle', () => {
    const m = makeChartModel(64);
    m.ingest(frame({ cycles: 10, population: 5, genotypes: 1 }));
    m.ingest(frame({ cycles: 20, population: 7, genotypes: 1 }));
    m.ingest(frame({ cycles: 35, population: 9, genotypes: 1 }));
    assert.deepEqual(m.population.points(), [
      { cycle: 10, value: 5 },
      { cycle: 20, value: 7 },
      { cycle: 35, value: 9 },
    ]);
  });

  it('[CHARTS-003] the live-genotype series tracks genotypes per frame', () => {
    const m = makeChartModel(64);
    m.ingest(frame({ cycles: 10, population: 5, genotypes: 2 }));
    m.ingest(frame({ cycles: 20, population: 5, genotypes: 4 }));
    assert.deepEqual(m.genotypes.points(), [
      { cycle: 10, value: 2 },
      { cycle: 20, value: 4 },
    ]);
  });

  it('[CHARTS-004] per-genotype series track the top-K genotype populations over time', () => {
    const m = makeChartModel(64);
    m.ingest(frame({ cycles: 10, population: 30, genotypes: 2, topGenotypes: bins([[7, 20], [9, 10]]) }));
    m.ingest(frame({ cycles: 20, population: 33, genotypes: 2, topGenotypes: bins([[7, 22], [9, 11]]) }));
    assert.deepEqual([...m.perGenotype.keys()].sort((a, b) => a - b), [7, 9]);
    assert.deepEqual(m.perGenotype.get(7)!.points(), [
      { cycle: 10, value: 20 },
      { cycle: 20, value: 22 },
    ]);
    assert.deepEqual(m.perGenotype.get(9)!.points(), [
      { cycle: 10, value: 10 },
      { cycle: 20, value: 11 },
    ]);
  });

  it('[CHARTS-005] sizeHistogram sums to population for every frame (invariant)', () => {
    // real engine frame: STAT guarantees Σ size-hist count == population.
    const f = realFrame(7, 50_000);
    const m = makeChartModel(64);
    m.ingest(f);
    const sum = m.sizeHistogram.reduce((s, b) => s + b.count, 0);
    assert.equal(sum, f.stats.population);
    assert.ok(f.stats.population > 0);
    // and for a synthetic frame
    const m2 = makeChartModel(64);
    m2.ingest(frame({ cycles: 5, population: 300, genotypes: 3, sizeHist: bins([[80, 200], [90, 100]]) }));
    assert.equal(m2.sizeHistogram.reduce((s, b) => s + b.count, 0), 300);
  });

  it('[CHARTS-006] a full SeriesBuffer downsamples deterministically and stays within capacity', () => {
    const cap = 4;
    const a = makeSeries(cap);
    const b = makeSeries(cap);
    for (let i = 1; i <= 33; i++) {
      a.push(i * 10, i);
      b.push(i * 10, i);
      assert.ok(a.points().length <= cap, `length ${a.points().length} <= ${cap}`);
    }
    // deterministic: identical push sequences → identical reduced series
    assert.deepEqual(a.points(), b.points());
    // survivors keep EXACT cycle keys (decimation, not averaging)
    for (const p of a.points()) assert.equal(p.cycle % 10, 0);
    // capacity guard on construction
    assert.throws(() => makeSeries(0), RangeError);
  });

  it('[CHARTS-007] readouts format current stats (fullnessPct = floor(fullness*100), integer counts)', () => {
    const m = makeChartModel(64);
    m.ingest(frame({ cycles: 3_200_000, population: 512, genotypes: 7, births: 40, deaths: 12, avgSize: 82.6, fullness: 0.4567 }));
    assert.equal(m.readouts.fullnessPct, 45);      // floor(45.67)
    assert.equal(m.readouts.population, 512);
    assert.equal(m.readouts.genotypes, 7);
    assert.equal(m.readouts.births, 40);
    assert.equal(m.readouts.deaths, 12);
    assert.equal(m.readouts.avgSize, 83);          // round(82.6)
    assert.equal(m.readouts.cycles, '3.2M');       // humanized display string
    // boundary: full soup → 100, empty → 0
    const m2 = makeChartModel(64);
    m2.ingest(frame({ cycles: 500, population: 1, genotypes: 1, fullness: 1 }));
    assert.equal(m2.readouts.fullnessPct, 100);
    assert.equal(m2.readouts.cycles, '500');
  });

  it('[CHARTS-008] series keyed by cycle so coalesced/dropped frames yield fewer samples without desync', () => {
    const full = stream(10);
    // simulate coalescing under load: only frames at indices 0,2,4,6,8 arrive.
    const coalesced = full.filter((_, i) => i % 2 === 0);
    const m = makeChartModel(64);
    for (const f of coalesced) m.ingest(f);
    // fewer samples, each still correct at its own cycle (no interpolation/gaps)
    assert.equal(m.population.points().length, coalesced.length);
    assert.deepEqual(
      m.population.points(),
      coalesced.map((f) => ({ cycle: f.cycles, value: f.stats.population })),
    );
  });

  it('[CHARTS-009] same ordered frame sequence → identical series for any viewer (UIINV-DET)', () => {
    const frames = stream(50); // exceeds capacity → also exercises identical downsampling
    const viewerA = makeChartModel(16, 8);
    const viewerB = makeChartModel(16, 8);
    for (const f of frames) viewerA.ingest(f);
    for (const f of frames) viewerB.ingest(f);
    const dump = (m: ReturnType<typeof makeChartModel>) => JSON.stringify({
      pop: m.population.points(),
      gen: m.genotypes.points(),
      per: [...m.perGenotype.entries()].map(([k, v]) => [k, v.points()]),
      hist: m.sizeHistogram,
      readouts: m.readouts,
    });
    assert.equal(dump(viewerA), dump(viewerB));
  });

  it('[CHARTS-010] population 0 / empty soup → zeroed series, empty histogram, no crash', () => {
    const m = makeChartModel(64);
    m.ingest(frame({ cycles: 100, population: 0, genotypes: 0, topGenotypes: [], sizeHist: [] }));
    assert.deepEqual(m.population.points(), [{ cycle: 100, value: 0 }]);
    assert.deepEqual(m.genotypes.points(), [{ cycle: 100, value: 0 }]);
    assert.deepEqual(m.sizeHistogram, []);
    assert.equal(m.perGenotype.size, 0);
    assert.equal(m.readouts.population, 0);
    assert.equal(m.readouts.fullnessPct, 0);
    assert.equal(m.readouts.avgSize, 0);
  });

  it('[CHARTS-011] retiring a genotype from top-K frees its buffer deterministically (bounded memory)', () => {
    // cap the per-genotype map at 2; rotate 3 genotypes across cycles.
    const m = makeChartModel(64, 2);
    m.ingest(frame({ cycles: 10, population: 30, genotypes: 2, topGenotypes: bins([[1, 20], [2, 10]]) }));
    m.ingest(frame({ cycles: 20, population: 30, genotypes: 2, topGenotypes: bins([[2, 18], [3, 12]]) }));
    // now genotype 1 (last seen at cycle 10) is the least-recently-updated → evicted.
    assert.equal(m.perGenotype.size, 2);
    assert.deepEqual([...m.perGenotype.keys()].sort((a, b) => a - b), [2, 3]);
    assert.equal(m.perGenotype.has(1), false);
    // determinism: a second model with the same frames retires the same genotype.
    const m2 = makeChartModel(64, 2);
    m2.ingest(frame({ cycles: 10, population: 30, genotypes: 2, topGenotypes: bins([[1, 20], [2, 10]]) }));
    m2.ingest(frame({ cycles: 20, population: 30, genotypes: 2, topGenotypes: bins([[2, 18], [3, 12]]) }));
    assert.deepEqual([...m2.perGenotype.keys()], [...m.perGenotype.keys()]);
  });

  it('[CHARTS-012] all displayed values resolve from the stats frame, never a UI constant (C-UI-SOURCE)', () => {
    // real engine frame: every readout must equal the frame's own stats field.
    const f = realFrame(11, 40_000);
    const m = makeChartModel(64);
    m.ingest(f);
    assert.equal(m.readouts.population, f.stats.population);
    assert.equal(m.readouts.genotypes, f.stats.genotypes);
    assert.equal(m.readouts.births, f.stats.births);
    assert.equal(m.readouts.deaths, f.stats.deaths);
    assert.equal(m.readouts.avgSize, Math.round((f.stats as { avgSize: number }).avgSize));
    assert.equal(m.readouts.fullnessPct, Math.floor((f.stats as { fullness: number }).fullness * 100));
    // changing the frame changes the readouts (not a fixed UI constant).
    const m2 = makeChartModel(64);
    m2.ingest(frame({ cycles: 1, population: 1, genotypes: 1, births: 0, deaths: 0 }));
    assert.notEqual(m2.readouts.population, m.readouts.population);
  });

  it('[CHARTS-013] the view-model exposes every series/scalar the visual design pass will render', () => {
    // The colors/marks/axes/legends are the design pass (`dataviz`); here we assert
    // the pure model surfaces exactly the data those visuals bind to.
    const m = makeChartModel(64);
    for (const f of stream(5)) m.ingest(f);
    assert.ok(Array.isArray(m.population.points()));
    assert.ok(Array.isArray(m.genotypes.points()));
    assert.ok(m.perGenotype instanceof Map);
    assert.ok(Array.isArray(m.sizeHistogram));
    for (const b of m.sizeHistogram) {
      assert.equal(typeof b.key, 'number');
      assert.equal(typeof b.label, 'string');
      assert.equal(typeof b.count, 'number');
    }
    assert.equal(typeof m.readouts.cycles, 'string');
    for (const k of ['population', 'genotypes', 'births', 'deaths', 'fullnessPct', 'avgSize'] as const) {
      assert.equal(typeof m.readouts[k], 'number');
    }
  });
});
