// Playground Component (PLAY) — pending acceptance criteria.
// Ref: docs/spec/content/02-playground-component.md §8.
// One it.todo per PLAY-NNN criterion. Pending until implemented; node:test todo tests.
// No src/ imports yet (an import error would fail the file); bodies land with the module.
import { describe, it } from 'node:test';

describe('Playground Component (PLAY)', () => {
  it.todo('[PLAY-001] same PlaygroundConfig (scenario+seed+starter+subset) => byte-identical ObservationFrame stream at every cycle; replay(toRunDescriptor(cfg)) reproduces the run bit-for-bit (C-CON-DET / INV-REPLAY)');
  it.todo('[PLAY-002] config is serializable & shareable: deserializeConfig(serializeConfig(cfg)) deep-equals cfg, is pure data, and two processes deserializing it produce identical runs (C-CON-DATA)');
  it.todo('[PLAY-003] reset() returns to the EXACT initial state: cycle == 0 and a frame byte-identical to a brand-new build from the same config (not a rewind of a used engine)');
  it.todo('[PLAY-004] stepInstruction() advances cycle by exactly 1 (engine.step); runTo(N) leaves cycle in [N, N + maxSliceSize) (whole-slice engine.run)');
  it.todo('[PLAY-005] exposed state.frame equals the engine observe()/stats() output at the current cycle (population/births/deaths/genotypes/fullness/tank) — streamed unchanged');
  it.todo('[PLAY-006] selectVariant(id) swaps to that variant\'s starter (compiled under the same subset), resets to cycle 0, and the same variant id always yields the same run (deterministic)');
  it.todo('[PLAY-007] goal status is queryable & deterministic: state.goal exposes pass/fail/progress per seed at the current cycle, and is undefined when no goal is configured (C-CON-DET, [06])');
  it.todo('[PLAY-008] starter (and every variant/solution) compiles under the active subset and loads in the engine (C-CON-COMPILES); a verb outside the subset fails normalization with a kid-friendly diagnostic (C-CON-SUBSET)');
  it.todo('[PLAY-009] injectEdited(source) returns {ok:true,creatureId} for subset-valid GeneScript (loaded via engine.inject) and {ok:false,diagnostics} — engine untouched — for uncompilable/gated code (C-CON-COMPILES / C-CON-SUBSET)');
  it.todo('[PLAY-010] display options never affect the run: changing panels/setSpeed/spotlight yields the same ObservationFrame stream and is absent from toRunDescriptor(cfg) (C-CON-DET)');
  it.todo('[PLAY-011] peek-under-hood exposes a source-mapped genome (source + bytes + line<->byte map, GSINV-SOURCEMAP); an edited/evolved genome with no authored source uses the disassembly (GeneScript §5)');
  it.todo('[PLAY-012] it drives a real @tierra26/engine (step/run/inject) and two playgrounds on one page run independently with no shared module-level state (rests on API-010 / C-SNAP)');
  it.todo('[PLAY-013] contract, not renderer: the module exposes only data (PlaygroundConfig/PlaygroundState) + behavior (PlaygroundControls) and references no DOM/host global (mirrors API-006)');
});
