// Engine API & Scenarios — pending acceptance tests (Code: API · Milestone: M0).
// Spec: docs/spec/engine/systems/15-engine-api-and-scenarios.md §8 (API-001..API-010).
// Encoded as node:test todo tests (spec-as-checklist). NO src imports yet — the engine
// does not exist; an import error would fail the file. When index.ts/config.ts land,
// replace `it.todo(name)` with `it(name, () => { ... })`. IDs are append-only.
import { describe, it } from 'node:test';

describe('Engine API & Scenarios (API)', () => {
  it.todo(
    '[API-001] normalizeScenario({}) fills documented defaults: soupSize 60000, ' +
      "instructionSet 'classic32', slicer {style:'ran',sizeDependent:true,slicePow:1}, " +
      'limits {minCellSize:12, searchLimitMult:5, movPropThrDiv:0.7, minTemplSize:1, ' +
      'maxCellSize:soupSize}, mutation {flaw:0,copy:0,cosmic:0}',
  );
  it.todo(
    '[API-002] invalid scenario is rejected (throws, never clamps): soupSize <= 0 or ' +
      '< maxCellSize, and an unknown instructionSet / unknown subset mnemonic',
  );
  it.todo(
    '[API-003] inject(genome) places it at the first free gap, returns a stable monotonic ' +
      'creature id, and registers a genotype; a second inject returns a strictly greater id',
  );
  it.todo(
    '[API-004] run(n) advances cycles by ~n (whole-slice: cycles in [n, n+maxSliceSize)); ' +
      'step() advances cycles by exactly 1',
  );
  it.todo(
    '[API-005] stats() reflects the world: population/births/deaths track counters; under ' +
      'mutation-0 sterile conditions genotypes == 1 (breed true); fullness rises 0→threshold as a per-1000 int',
  );
  it.todo(
    '[API-006] purity/worker-portability: index.ts + config.ts reference no DOM/host global ' +
      '(no window/self/document/Math.random/Date.now) — source assertion — so the module is worker- and server-portable',
  );
  it.todo(
    '[API-007] replay(desc) reproduces a run: replay snapshot digest equals a live inject→run ' +
      'digest; a RunDescriptor with a mismatched engineVersion is refused',
  );
  it.todo(
    "[API-008] tutorial subset: SubsetSpec {base:'classic32', include:[...]} builds an active " +
      'set of exactly the requested instructions plus nop0/nop1 (INV-TEMPLATE); unknown mnemonic rejected',
  );
  it.todo(
    '[API-009] snapshot()/restore() round-trip: Engine.restore(e.snapshot()) continues ' +
      'bit-identically for N further cycles (INV-ROUNDTRIP at the API surface)',
  );
  it.todo(
    '[API-010] API is synchronous & re-entrant: step/run/stats/inject return synchronously ' +
      '(no Promise); two Engine instances in one process are fully independent (no shared module state)',
  );
  it.todo("[API-011] normalizeScenario fills full defaults (sizeDependent=false S6, malMode first-fit S7, full mutation S8, disturbance/dropDead/inoculation) + validates");
  it.todo("[API-012] inject(genome,{founderId}) stamps the seed creature founderId (default 0) (S1)");
});
