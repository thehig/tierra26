// Learning Progression & Unlocks (PROGRESS) — pending criteria.
// Ref: docs/spec/content/05-learning-progression-and-unlocks.md §8.
// Conventions: engine anchor docs/spec/engine/systems/00-architecture.md §8.3
// (node:test it.todo, one per criterion, NO src/ imports yet — bodies land with the module).
import { describe, it } from 'node:test';

describe('Learning Progression & Unlocks (PROGRESS)', () => {
  it.todo('[PROGRESS-001] the prerequisite graph is a DAG: no lesson is in its own prereq closure; topoOrder succeeds and a cyclic graph fails loudly (never loops)');
  it.todo('[PROGRESS-002] every id in a lesson requires[] resolves to an existing lesson (no dangling prerequisite edges)');
  it.todo('[PROGRESS-003] for completed = empty, available == exactly the root lessons (empty requires[]) and unlocked verbs/concepts/subset are empty');
  it.todo('[PROGRESS-004] for every lesson, uses.verbs subset of cumulative(lesson).verbs and uses.concepts subset of cumulative(lesson).concepts (CONTINV-INTRO-BEFORE-USE / C-CON-SUBSET)');
  it.todo('[PROGRESS-005] cumulative unlocks are monotonic along any prereq path: cumulative(prereq) subset of cumulative(lesson), for verbs and concepts');
  it.todo('[PROGRESS-006] the active subset equals the sorted union of unlocked verbs: activeSubset(l) === sort(cumulative(l).verbs), no extra and none missing');
  it.todo('[PROGRESS-007] design->emergence ordering: every mutation:on lesson comes after (topologically) a lesson unlocking the replication verbs (make-space, copy-byte, divide)');
  it.todo('[PROGRESS-008] sandbox unlocks all: computeUnlocked({sandbox:true}) yields the full classic-32 verbs, all concepts, full subset, and every lesson available, independent of completed (gate, not hard-lock)');
  it.todo('[PROGRESS-009] computeUnlocked is a pure function of (curriculum, learnerState): same completed set -> identical unlocks, no insertion-order/RNG/wall-clock dependence (C-CON-DET)');
  it.todo('[PROGRESS-010] chapter phase is monotonic in chapter order: design -> life -> emergence -> versus; no emergence/versus chapter precedes a design chapter');
  it.todo('[PROGRESS-011] each verb and each concept is unlocked by exactly one lesson (a single introducer, no ambiguous/duplicate introductions)');
  it.todo('[PROGRESS-012] emergence-phase concepts (mutation, selection, parasite, immunity, arms-race) are unlocked only in emergence/versus chapters, never in design/life');
  it.todo('[PROGRESS-013] activeSubset(l) is order-independent: folding cumulative unlocks in any valid topological order yields the identical subset');
  it.todo('[PROGRESS-014] completing an already-completed lesson is idempotent: unlocked sets and available are unchanged (set semantics)');
  it.todo('[PROGRESS-015] completing all of a lesson prerequisites makes that lesson appear in available deterministically, and it is absent while any prerequisite is incomplete');
  it.todo('[PROGRESS-016] prerequisiteClosure(l) is the exact transitive requires reachability of l and never includes l itself');
  it.todo('[PROGRESS-017] the full curriculum is sound end-to-end: DAG (001) + edges resolve (002) + one introducer per verb/concept (011) + intro-before-use (004) — the shippable-curriculum gate');
});
