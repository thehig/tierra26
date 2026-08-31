// Match Runner & Fairness (RUNNER) — acceptance criteria as pending tests.
// Ref: docs/spec/versus/03-match-runner-and-fairness.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('Match Runner & Fairness (RUNNER)', () => {
  it.todo('[RUNNER-001] all player genomes are injected at cycle 0 before any instruction runs (VSINV-SIMULTANEOUS)');
  it.todo('[RUNNER-002] each injected seed creature is stamped with its founderId');
  it.todo('[RUNNER-003] placements(n, soupSize, even) returns round(i*soupSize/n) — evenly spaced, non-overlapping, pure');
  it.todo('[RUNNER-004] injection/initial-scheduling order is a seed-derived permutation, not fixed to slot index');
  it.todo('[RUNNER-005] buildDescriptor is pure and captures scenario+seed+players+placement+threshold+rules+engineVersion');
  it.todo('[RUNNER-006] runMatch(desc) reproduces identical live standings + result for any viewer (VSINV-DET)');
  it.todo('[RUNNER-007] a MatchDescriptor round-trips to/from a VersusLink; toRunDescriptor(m) yields a valid RunDescriptor (S16)');
  it.todo('[RUNNER-008] the match stops deterministically at the threshold cycle/generation');
  it.todo('[RUNNER-009] each observed frame yields a LiveStanding via attribute for the scoreboard');
  it.todo('[RUNNER-010] a genome that fails to compile is rejected before the match starts (no partial start)');
  it.todo('[RUNNER-011] a soup too small for N even-spaced genomes is rejected with a clear error');
  it.todo('[RUNNER-012] best-of-N runs the configured seeds with rotated placement and aggregates deterministically');
  it.todo('[RUNNER-013] the match runs via the worker on the authoritative engine; no local simulation (C-VS-VIEW)');
  it.todo('[RUNNER-014] a generations threshold is only accepted when the engine exposes a generation counter');
});
