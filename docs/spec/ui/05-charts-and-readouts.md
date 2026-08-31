# Charts & Readouts — Engineering Spec (Code: CHARTS · Milestone: M2)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§2: C-UI-VIEW,
C-UI-SOURCE, C-UI-RESPONSIVE, C-UI-THEME). Conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Consumes: engine [`13-statistics-and-observation`](../engine/systems/13-statistics-and-observation.md)
(`LiveStats`, histograms, `ObservationFrame`), [`01-worker-protocol`](01-worker-protocol.md)
(`frame`/`stats` events). **Visual encoding is a later design pass — the `dataviz` skill
guides it; this doc specifies the testable series/transform logic.**

---

## 1. Purpose & responsibility

Charts turn the engine's per-frame statistics into legible **time-series and distributions** —
population over time, live-genotype count, genome-size distribution, per-species population —
plus scalar **readouts** (cycles, population, genotypes, births, deaths, fullness, avg size).
It owns the *pure data transforms* (frame stream → plot series / histogram / formatted value);
the visual encoding (colors, marks, layout) is the design pass. All data comes from the stats
frame — the UI computes nothing about the simulation itself (C-UI-SOURCE / C-UI-VIEW).

## 2. Interfaces

```ts
import type { ObservationFrame, LiveStats } from '@tierra26/engine'; // (future)

interface SeriesBuffer {                     // bounded, append-only ring for a time series
  capacity: number;                          // max retained points
  push(cycle: number, value: number): void;  // deterministic append + downsample when full
  points(): { cycle: number; value: number }[];
}

interface ChartModel {
  population: SeriesBuffer;
  genotypes: SeriesBuffer;
  perGenotype: Map<number, SeriesBuffer>;    // top-K genotype populations over time
  sizeHistogram: HistBin[];        // == the engine `HistBin` {key,label,count} from STAT [13] (S21); key = size
  readouts: Readouts;
  ingest(frame: ObservationFrame): void;     // pure state transition per frame
}

interface Readouts {                         // formatted scalars for the HUD
  cycles: string; population: number; genotypes: number;
  births: number; deaths: number; fullnessPct: number; avgSize: number;
}
```

## 3. Data structures
- **`SeriesBuffer`** — a fixed-capacity ring; when full it **downsamples deterministically**
  (e.g. drop-every-other / bucket-average with integer math) so long runs stay bounded without
  losing determinism (C-UI-RESPONSIVE). Same frames in → same points out.
- **`ChartModel`** — the whole HUD's pure state; `ingest(frame)` is the only mutator and is a
  deterministic function of the frame sequence.
- **`sizeHistogram`** — derived directly from the frame's per-creature size data; **sums to
  the population** (invariant with engine STAT).

## 4. Behavior / algorithms
- **Ingest** — each `frame`/`stats` event calls `ingest(frame)`: append `population`,
  `genotypes`, and top-K per-genotype counts to their `SeriesBuffer`s keyed by `frame.cycle`;
  rebuild `sizeHistogram` from the frame; recompute `readouts`. Pure; no clock/RNG.
- **Downsampling** — when a buffer is at capacity, apply the fixed integer downsample rule; the
  chosen rule is deterministic so two viewers see the same reduced series (UIINV-DET backing).
- **Readouts formatting** — integers for counts; `fullnessPct = floor(occupied*100/soupSize)`;
  `avgSize` integer-rounded; `cycles` humanized (e.g. `3.2M`) for display only (formatting is
  presentation, but the underlying values come from stats).
- **Coalescing** — charts consume whatever frames arrive; if frames are coalesced under load,
  the series simply has fewer points (each still correct at its cycle) — no gaps that desync,
  no corruption (C-UI-RESPONSIVE / UIINV-BACKPRESSURE). Series are keyed by cycle, not by
  arrival index, so a dropped frame is just a skipped sample.
- **Histogram sum invariant** — `Σ sizeHistogram.count == population` for every frame.

## 5. Interconnections
- **engine [13] Statistics** — the sole data source (`LiveStats`, histograms in the frame).
- **[01] Worker** — delivers `frame`/`stats` events; charts never call the engine.
- **[07] Shell** — charts appear in sandbox/lesson/versus layouts; readouts feed the HUD.
- **design pass (`dataviz`)** — realizes colors/marks/axes/legends over these series.

## 6. Determinism & edge cases
- `ingest` over the same ordered frame sequence yields an identical `ChartModel` (pure).
- Empty soup / population 0 → series append 0; histogram empty; readouts zeroed.
- A genotype leaving the top-K → its `perGenotype` buffer is retired deterministically (kept
  until capacity pressure), never leaking unbounded Maps.
- Very long runs never grow memory without bound (capacity + downsample).
- Coalesced/dropped frames → fewer samples, each still correct; no interpolation that invents
  data.

## 7. Fidelity notes
- **[CORE]** all values sourced from engine stats (C-UI-SOURCE); no UI-side simulation.
- **[MOD]** modern charting; original Tierra had plan/histogram text output — this is its heir.
- **[OPTIONAL]** advanced views (lineage/phylogeny trees, size-vs-time heatmaps) — later.

## 8. Acceptance criteria
- **CHARTS-001** `ingest` is a pure function of the frame sequence — same frames, same
  `ChartModel`; no clock/RNG.
- **CHARTS-002** Appending frames builds the population series keyed by cycle.
- **CHARTS-003** The live-genotype series tracks `genotypes` per frame.
- **CHARTS-004** Per-genotype series track the top-K genotype populations over time.
- **CHARTS-005** `sizeHistogram` sums to `population` for every frame (invariant).
- **CHARTS-006** A full `SeriesBuffer` downsamples deterministically and stays within capacity.
- **CHARTS-007** Readouts format the current stats (`fullnessPct = floor(occupied*100/soupSize)`,
  integer counts).
- **CHARTS-008** Series are keyed by cycle, so coalesced/dropped frames yield fewer samples
  without gaps that desync (UIINV-BACKPRESSURE).
- **CHARTS-009** Same ordered frame sequence → identical series for any viewer (UIINV-DET).
- **CHARTS-010** Population 0 / empty soup → zeroed series, empty histogram, no crash.
- **CHARTS-011** Retiring a genotype from top-K frees its buffer deterministically (bounded
  memory).
- **CHARTS-012** All displayed values resolve from the stats frame, never a UI constant
  (C-UI-SOURCE).
- **CHARTS-013** `(visual)` chart colors, marks, axes, legends, and layout per the design pass
  (`dataviz`).

## 9. Open questions
1. Default series capacity / downsample rule (bucket-average vs decimate) — tune with real runs.
2. Top-K size for per-genotype series (align with STAT's genotype cap).
3. Whether readouts humanization (`3.2M`) lives here or in a shared format util.
