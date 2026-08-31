// Lineage Attribution (LINEAGE) — acceptance criteria as pending tests.
// Ref: docs/spec/versus/02-lineage-attribution.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('Lineage Attribution (LINEAGE)', () => {
  it.todo('[LINEAGE-001] a creature has a founderId; injection stamps it; default is 0 (neutral)');
  it.todo('[LINEAGE-002] on divide, the daughter founderId equals the mother (VSINV-INHERIT)');
  it.todo('[LINEAGE-003] attribution is by founder, not genotype: a mutated descendant keeps its founder');
  it.todo('[LINEAGE-004] a creature descends to exactly one founder at any depth (no chain walk, dead-ancestor independent)');
  it.todo('[LINEAGE-005] a daughter produced while executing borrowed code is attributed by descent (mother founder)');
  it.todo('[LINEAGE-006] per-founder populations partition the live population: Σ + neutral == total every frame');
  it.todo('[LINEAGE-007] attribute(frame) is a pure read of frame tags (no recomputation from genomes)');
  it.todo('[LINEAGE-008] the founder tag is simulation-inert: enabling scoring does not change a run digest (fidelity)');
  it.todo('[LINEAGE-009] reaping a creature decrements exactly its founder count');
  it.todo('[LINEAGE-010] neutral (founder 0) creatures are excluded from player scoring');
});
