// UI cross-layer invariants (UIINV).
// Ref: docs/spec/ui/00-overview.md §4.
// Pending until implemented; node:test todo tests. No src/ imports yet.
import { describe, it } from 'node:test';

describe('UI cross-layer invariants (UIINV)', () => {
  it.todo('[UIINV-VIEW] no simulation state is mutated on the main thread; run state comes only from worker frames');
  it.todo('[UIINV-ROUNDTRIP] after a command→worker→frame cycle the view-model is a pure function of the latest frame');
  it.todo('[UIINV-DET] replaying a shared RunDescriptor renders an identical frame sequence for any viewer');
  it.todo('[UIINV-EDITOR-ENGINE] editor genome, injected genome, and inspector disassembly are the same genome (three views)');
  it.todo('[UIINV-SOURCE] every displayed instruction fact/keyword/color resolves to a genescript/content source, not a UI constant');
  it.todo('[UIINV-BACKPRESSURE] dropping/coalescing frames under load never corrupts the view or desyncs from the worker');
});
