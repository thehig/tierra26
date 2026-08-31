// Versus cross-layer invariants (VSINV).
// Ref: docs/spec/versus/00-overview.md §6.
// Pending until implemented; node:test todo tests. No src/ imports yet.
import { describe, it } from 'node:test';

describe('Versus cross-layer invariants (VSINV)', () => {
  it.todo('[VSINV-DET] the same MatchDescriptor yields identical standings and result for any viewer');
  it.todo('[VSINV-SIMULTANEOUS] every player genome is present at cycle 0; the first instruction sees all founders placed');
  it.todo('[VSINV-ATTRIB] per-founder populations + neutral == total population at every frame (partition)');
  it.todo('[VSINV-INHERIT] a daughter founderId equals its mother for every birth (attribution survives genotype drift)');
  it.todo('[VSINV-MIRROR-SEED] over best-of-N rotation a mirror match favors no player beyond seed noise (fairness)');
});
