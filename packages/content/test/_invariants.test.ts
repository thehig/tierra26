// Learning-content cross-layer invariants (CONTINV).
// Ref: docs/spec/content/00-overview.md §6.
// Pending until implemented; node:test todo tests. No src/ imports yet.
import { describe, it } from 'node:test';

describe('Content cross-layer invariants (CONTINV)', () => {
  it.todo('[CONTINV-COVERAGE] every classic-32 verb has a per-instruction page and a keyword entry (no orphans)');
  it.todo('[CONTINV-VALID] every shipped lesson validates against the content schema');
  it.todo('[CONTINV-COMPILE] every playground starter/solution genome compiles under its subset and loads in the engine');
  it.todo('[CONTINV-INTRO-BEFORE-USE] no lesson requires a verb not unlocked by it or a prerequisite (curriculum graph is sound)');
  it.todo('[CONTINV-DET] goal-checkers and playground runs are deterministic per seed');
  it.todo('[CONTINV-KEYWORDS] keyword auto-linking only links registry terms and is deterministic');
});
