// Cross-package integration invariants (INT-*) — the paths no single package can test alone.
// Ref: docs/spec/validation/C-test-coverage-gaps.md §3; SUMMARY S11/S12.
// Pending until the packages implement `src/`; encoded as node:test todo (spec-as-checklist).
// When live, these import the real @tierra26/* packages (dev-deps) and the ancestor fixture.
import { describe, it } from 'node:test';

describe('Cross-package integration (INT)', () => {
  it.todo('[INT-ANCESTOR-GOLDEN] the 0080aaa fixture, injected sterile (mutation off), breeds true (byte-identical first daughter, mov_daught=80) and matches a pinned RunDigest (S11)');
  it.todo('[INT-SNAPSHOT-REPLAY-E2E] for a mutation-on run: live-run digest == replay(descriptor) digest == restore(snapshot) continued digest, at every checkpoint');
  it.todo('[INT-FOUNDER-ATTRIB-MUTATION] with mutation on, a mutated descendant is attributed to its founder; Σ per-founder counts == population at every frame (VSINV-INHERIT/ATTRIB)');
  it.todo('[INT-EDITOR-ENGINE] compile(GeneScript) bytes == injected genome == inspector disassembly bytes (UIINV-EDITOR-ENGINE)');
  it.todo('[INT-GS-ANCESTOR] the GeneScript ancestor compiles to a genome that breeds true in the engine (GSINV-ANCESTOR)');
  it.todo('[INT-CONTENT-COMPILE] every shipped lesson/playground starter genome compiles under its active subset and loads in the engine (CONTINV-COMPILE)');
  it.todo('[INT-FRAME-VIEWS] one ObservationFrame feeds tank, charts, and inspector view-models with mutually consistent values (single source)');
  it.todo('[INT-SUBSET-PORTABLE] a named subset emits identical opcode bytes across the content→genescript→engine boundary (S10 ordering)');
  it.todo('[INT-GOAL-DETERMINISM] a content goal-checker verdict is identical across two same-seed runs and a replay (CONTINV-DET)');
  it.todo('[INT-VERSUS-MATCH-REPLAY] a MatchDescriptor replays identical live standings + final result for any viewer (VSINV-DET)');
});
