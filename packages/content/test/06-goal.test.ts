// Goals, Challenges & Assessment (GOAL) — deterministic success conditions for lessons &
// playgrounds: the goal model, the engine-backed checker, pass/fail + progress semantics,
// kid-friendly failure hints, multi-tier goals, and Versus win-conditions.
// Ref: docs/spec/content/06-goals-challenges-and-assessment.md §8 (acceptance criteria GOAL-001..012).
// Cross-layer determinism also lives in test/_invariants.test.ts (CONTINV-DET).
// Pending until @tierra26/content exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import content/engine src/ modules yet (they don't exist — an import would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Goals, Challenges & Assessment (GOAL)', () => {
  // --- the goal model + core checker (replicates) ---
  it.todo(
    '[GOAL-001] a `replicates within N` goal passes (measured births >= 1) for a genome that breeds and fails (measured 0) for an inert one — verdict from engine births, not source',
  );

  // --- determinism (C-CON-DET / CONTINV-DET) ---
  it.todo(
    '[GOAL-002] the checker is deterministic: two checkGoal calls with the same (scenario, seed, genome, goal) return identical GoalResults (passed/measured/atCycle/hint), incl. across a fresh process; no Math.random/Date.now/float on the verdict path',
  );

  // --- reading genome size correctly ---
  it.todo(
    '[GOAL-003] a `shrink-genome` goal passes iff some live descendant genome is < S bytes (read from the size histogram/live sizes) with measured = smallest live genome size, and fails with the correct measured otherwise',
  );

  // --- kid-friendly teaching hint on failure (reuses GeneScript DIAG tone) ---
  it.todo(
    "[GOAL-004] a failed `replicates` goal for an alive-but-never-divided creature yields a GoalHint code:'never-divided', teaches:true, a short second-person message naming `divide`, jargon only in hoverTerms, a concrete suggestion, and byte-identical text for the same run",
  );

  // --- multi-tier goals: required vs bonus tracked separately ---
  it.todo(
    '[GOAL-005] required vs bonus goals are tracked separately: checkLesson sets requiredMet from only the required goals and counts passed bonus goals in bonusMet; an unmet bonus goal does not clear requiredMet',
  );

  // --- completion → PROGRESS unlock ---
  it.todo(
    '[GOAL-006] meeting all required goals marks the lesson complete: requiredMet is true, recordOutcome adds it to completedLessonIds, and isLessonComplete(rec, lessonId) is true (the boolean PROGRESS [05] reads); one failed required goal leaves it incomplete',
  );

  // --- anti-cheese: observable engine outcomes only ---
  it.todo(
    '[GOAL-007] goals evaluate observable engine outcomes (anti-cheese): a goal passes only when a real @tierra26/engine run exhibits the outcome — a genome that appears to replicate but faults before dividing fails `replicates`, and no editor/AST heuristic can satisfy it',
  );

  // --- Versus win-condition: deterministic ranking of two genomes ---
  it.todo(
    "[GOAL-008] a Versus win-condition ranks two genomes deterministically: rankVersus with {kind:'out-populate', by:C} injects both into one shared soup, runs to cycle C, returns winner ('a'|'b'|'tie') by integer live-population comparison; same (scenario,a,b) → same winner (INV-DET); exact tie → 'tie'",
  );

  // --- reach-pop uses an integer high-water mark ---
  it.todo(
    '[GOAL-009] a `reach-pop` goal passes iff live population reaches >= P at any sample by cycle N (measured = max population seen) so a transient peak that later dips still passes; it reads stats().population, never fullness',
  );

  // --- survive N horizon ---
  it.todo(
    "[GOAL-010] a `survive N` goal passes iff population > 0 for all N cycles (measured = N); a lineage that dies at cycle k < N fails with measured:k and a 'died-early' hint",
  );

  // --- validation rejects impossible/unsatisfiable goals ---
  it.todo(
    '[GOAL-011] invalid/unsatisfiable goals are rejected at validation: a missing kind-required param, a non-integer/<=0 deadline, or a required `diversity` goal in a mutation==0 scenario (unwinnable under breed-true) is rejected — never silently clamped or shipped',
  );

  // --- learner progress record is pure state ---
  it.todo(
    '[GOAL-012] the learner progress record is pure state: recordOutcome merges into stable-sorted, dedup’d metGoalIds/completedLessonIds; re-recording is idempotent and merging is order-independent; no engine state or float in the record (serializable, deterministic)',
  );
});
