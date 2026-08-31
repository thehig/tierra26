// Charts & Readouts (CHARTS) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/05-charts-and-readouts.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('Charts & Readouts (CHARTS)', () => {
  it.todo('[CHARTS-001] ingest is a pure function of the frame sequence — no clock/RNG');
  it.todo('[CHARTS-002] appending frames builds the population series keyed by cycle');
  it.todo('[CHARTS-003] the live-genotype series tracks genotypes per frame');
  it.todo('[CHARTS-004] per-genotype series track the top-K genotype populations over time');
  it.todo('[CHARTS-005] sizeHistogram sums to population for every frame (invariant)');
  it.todo('[CHARTS-006] a full SeriesBuffer downsamples deterministically and stays within capacity');
  it.todo('[CHARTS-007] readouts format current stats (fullnessPct = floor(occupied*100/soupSize), integer counts)');
  it.todo('[CHARTS-008] series keyed by cycle so coalesced/dropped frames yield fewer samples without desync (UIINV-BACKPRESSURE)');
  it.todo('[CHARTS-009] same ordered frame sequence → identical series for any viewer (UIINV-DET)');
  it.todo('[CHARTS-010] population 0 / empty soup → zeroed series, empty histogram, no crash');
  it.todo('[CHARTS-011] retiring a genotype from top-K frees its buffer deterministically (bounded memory)');
  it.todo('[CHARTS-012] all displayed values resolve from the stats frame, never a UI constant (C-UI-SOURCE)');
  it.todo('[CHARTS-013] (visual) chart colors, marks, axes, legends, and layout per the design pass');
});
