// Match Model & Scoring (MATCH) — acceptance criteria as pending tests.
// Ref: docs/spec/versus/01-match-model-and-scoring.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('Match Model & Scoring (MATCH)', () => {
  it.todo('[MATCH-001] a MatchConfig requires ≥2 players with distinct founderIds and genomes; invalid rejected');
  it.todo('[MATCH-002] Threshold is cycles or generations — both in-sim clocks, never wall-clock');
  it.todo('[MATCH-003] score = per-founder live population from stats; neutral (founder 0) does not score');
  it.todo('[MATCH-004] score/rank are pure functions (same inputs → same standings/result)');
  it.todo('[MATCH-005] ranking sorts by descending population; equal populations share a rank');
  it.todo('[MATCH-006] tiebreakers apply in configured order; exhausted ties → draw');
  it.todo('[MATCH-007] tiebreaker inputs come from recorded engine observables (deterministic)');
  it.todo('[MATCH-008] the result records atCycle/atGeneration and the MatchDescriptor for replay');
  it.todo('[MATCH-009] an inert (never-replicating) genome scores its surviving count and loses, no crash');
  it.todo('[MATCH-010] total extinction ranks by peak/last-nonzero standings (no undefined winner)');
  it.todo('[MATCH-011] all scores are integers');
  it.todo('[MATCH-012] the scoring core matches content rankVersus for the same inputs (shared logic)');
});
