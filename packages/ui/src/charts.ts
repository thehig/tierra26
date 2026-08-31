// ============================================================================
// @tierra26/ui — CHARTS: charts + readouts VIEW-MODEL (pure per-frame state).
// Ref: docs/spec/ui/05-charts-and-readouts.md (§2 interfaces, §4 algorithms, §8).
//
// PURE data model — NO DOM/canvas, NO window/document, NO Date.now/Math.random.
// The visual encoding (colors/marks/axes) is the later design pass (`dataviz`);
// this module owns only the deterministic frame-stream → series/histogram/scalar
// transforms. Same ordered frame sequence in → identical ChartModel out (C-UI-DET).
//
// strip-types note: no parameter properties/enums/decorators — explicit fields,
// `import type`, plain factories over closures.
// ============================================================================

import type { ObservationFrame, HistBin, LiveStats } from './protocol.ts';

// ---- SeriesBuffer: bounded, append-only ring for one time series ------------
export interface SeriesBuffer {
  capacity: number;                          // max retained points
  push(cycle: number, value: number): void;  // deterministic append + downsample when full
  points(): { cycle: number; value: number }[];
}

// ---- ChartModel: the whole HUD's pure per-frame state -----------------------
export interface ChartModel {
  population: SeriesBuffer;
  genotypes: SeriesBuffer;
  perGenotype: Map<number, SeriesBuffer>;    // top-K genotype populations over time (key = genotype id)
  sizeHistogram: HistBin[];                  // engine HistBin {key,label,count}; key = size
  readouts: Readouts;
  ingest(frame: ObservationFrame): void;     // the ONLY mutator; pure fn of the frame sequence
}

// ---- Readouts: formatted scalars for the HUD --------------------------------
export interface Readouts {
  cycles: string;                            // humanized for display (e.g. "3.2M")
  population: number; genotypes: number;
  births: number; deaths: number;
  fullnessPct: number;                       // floor(occupied*100/soupSize)
  avgSize: number;                           // integer-rounded
}

// ---- Point type (internal + points() return) --------------------------------
interface Point { cycle: number; value: number }

// ============================================================================
// Downsample algorithm — DECIMATE-EVERY-OTHER (deterministic, integer-keyed).
//
// The ring stores up to `capacity` points in arrival order. When a push would
// exceed capacity, we drop every other retained point (keep even indices 0,2,4…)
// BEFORE the buffer can grow past `capacity`. This:
//   • keeps length bounded strictly at/under `capacity` (bounded memory),
//   • is a pure function of the (cycle,value) sequence — no clock/RNG,
//   • preserves EXACT cycle keys of the survivors (no averaging → no float drift;
//     values stay whatever integer the stats frame reported), so the series is
//     still correctly "keyed by cycle" after compaction,
//   • doubles the effective sampling stride each time capacity is hit, so a very
//     long run degrades gracefully while still spanning the full cycle range.
// Same frames in → same reduced points out for any viewer (UIINV-DET backing).
// ============================================================================
export function makeSeries(capacity: number): SeriesBuffer {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('SeriesBuffer capacity must be a positive integer');
  }
  let pts: Point[] = [];
  return {
    capacity,
    push(cycle: number, value: number): void {
      pts.push({ cycle, value });
      if (pts.length > capacity) {
        const kept: Point[] = [];
        for (let i = 0; i < pts.length; i += 2) kept.push(pts[i]!);
        pts = kept;
      }
    },
    points(): Point[] {
      // defensive copy: callers cannot mutate the ring's internal state
      return pts.map((p) => ({ cycle: p.cycle, value: p.value }));
    },
  };
}

// ---- Readout formatting -----------------------------------------------------

// Humanize a cycle count for DISPLAY only (values themselves come from stats).
// <1000 → exact; else one-decimal with a k/M/G suffix, trailing ".0" trimmed.
function humanizeCycles(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return neg + String(abs);
  const units: [string, number][] = [['G', 1e9], ['M', 1e6], ['k', 1e3]];
  for (const [sym, div] of units) {
    if (abs >= div) {
      const s = (abs / div).toFixed(1);
      return neg + (s.endsWith('.0') ? s.slice(0, -2) : s) + sym;
    }
  }
  return neg + String(abs);
}

// Readouts derive ENTIRELY from the frame's stats (C-UI-SOURCE); no UI constants.
// fullnessPct = floor(fullness*100): the frame carries the presentation-only
// `fullness` = occupied/soupSize in [0,1] (STAT), so floor(fullness*100) is the
// spec's floor(occupied*100/soupSize) with the only inputs the frame exposes.
// avgSize is integer-rounded (the engine already floors Σsize/pop; round is a
// safe no-op there and tolerates a synthetic float).
function computeReadouts(s: LiveStats): Readouts {
  // LiveStats is single-sourced (engine stats.ts) and carries avgSize + fullness directly.
  return {
    cycles: humanizeCycles(s.cycles),
    population: s.population,
    genotypes: s.genotypes,
    births: s.births,
    deaths: s.deaths,
    fullnessPct: Math.floor((s.fullness ?? 0) * 100),
    avgSize: Math.round(s.avgSize ?? 0),
  };
}

function emptyReadouts(): Readouts {
  return { cycles: '0', population: 0, genotypes: 0, births: 0, deaths: 0, fullnessPct: 0, avgSize: 0 };
}

// ============================================================================
// ChartModel factory.
//   capacity        — per-series ring capacity (population/genotypes/perGenotype)
//   perGenotypeCap  — max simultaneously retained per-genotype buffers. A genotype
//                     leaving the top-K keeps its buffer until capacity pressure,
//                     then the least-recently-updated one is evicted (tie-break:
//                     smallest genotype id). Deterministic → bounded memory, no
//                     unbounded Map leak (spec §6, CHARTS-011).
// ============================================================================
export function makeChartModel(capacity = 256, perGenotypeCap = 64): ChartModel {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('ChartModel capacity must be a positive integer');
  }
  if (!Number.isInteger(perGenotypeCap) || perGenotypeCap < 1) {
    throw new RangeError('perGenotypeCap must be a positive integer');
  }

  const population = makeSeries(capacity);
  const genotypes = makeSeries(capacity);
  const perGenotype = new Map<number, SeriesBuffer>();
  const lastSeen = new Map<number, number>(); // genotype id → last cycle it appeared in top-K

  const model: ChartModel = {
    population,
    genotypes,
    perGenotype,
    sizeHistogram: [],
    readouts: emptyReadouts(),
    ingest(frame: ObservationFrame): void {
      const s = frame.stats;
      // 1) core time series, keyed by the frame's cycle (not arrival index).
      population.push(frame.cycles, s.population);
      genotypes.push(frame.cycles, s.genotypes);

      // 2) per-genotype series from the frame's top-K bins.
      for (const bin of frame.topGenotypes) {
        let buf = perGenotype.get(bin.key);
        if (buf === undefined) {
          buf = makeSeries(capacity);
          perGenotype.set(bin.key, buf);
        }
        buf.push(frame.cycles, bin.count);
        lastSeen.set(bin.key, frame.cycles);
      }

      // 3) retire stale per-genotype buffers deterministically when over cap.
      while (perGenotype.size > perGenotypeCap) {
        let victim = -1;
        let oldest = Number.POSITIVE_INFINITY;
        for (const key of perGenotype.keys()) {
          const t = lastSeen.get(key) ?? -1;
          if (t < oldest || (t === oldest && (victim === -1 || key < victim))) {
            oldest = t;
            victim = key;
          }
        }
        perGenotype.delete(victim);
        lastSeen.delete(victim);
      }

      // 4) size histogram — copied from the frame (Σcount == population per STAT).
      model.sizeHistogram = frame.sizeHist.map((b) => ({ key: b.key, label: b.label, count: b.count }));

      // 5) readouts — formatted scalars, all sourced from the frame's stats.
      model.readouts = computeReadouts(s);
    },
  };
  return model;
}
