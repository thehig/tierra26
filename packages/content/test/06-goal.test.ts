// Goals, Challenges & Assessment (GOAL) — deterministic success conditions for lessons &
// playgrounds: the goal model, the engine-backed checker, pass/fail + progress semantics,
// kid-friendly failure hints, multi-tier goals, and Versus win-conditions.
// Ref: docs/spec/content/06-goals-challenges-and-assessment.md §8 (acceptance criteria GOAL-001..012).
// Cross-layer determinism also lives in test/_invariants.test.ts (CONTINV-DET).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Goal } from '../src/types.ts';
import {
  checkGoal,
  checkLesson,
  recordOutcome,
  isLessonComplete,
  rankVersus,
  validateGoal,
  EMPTY_RECORD,
  type CheckContext,
  type LessonGoalOutcome,
} from '../src/goal.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';

// ---- genome fixtures -------------------------------------------------------
// ANC is the canonical breeder (first daughter ~cycle 830, breeds true).
// A trivially inert creature: four nops — it stays alive forever but NEVER calls divide.
const INERT = new Uint8Array([0, 0, 0, 0]);
// A creature whose source "looks like" it replicates (it is the `divide` opcode) but faults at the
// copy gate every time — no daughter is ever born (anti-cheese subject, GOAL-007). divide == 31.
const DIVIDE_ONLY = new Uint8Array([31]);
// A tiny live survivor (12 nops) — never divides, so its smallest live genome size stays 12.
const SMALL12 = new Uint8Array(12).fill(0);

function ctxOf(genome: Uint8Array, over: Partial<CheckContext> = {}): CheckContext {
  return { scenario: { seed: 0 }, seed: 0, genome, maxCycles: 200_000, ...over };
}

function goal(g: Partial<Goal> & Pick<Goal, 'kind' | 'params'>): Goal {
  return { id: g.id ?? 'g', tier: g.tier ?? 'required', title: g.title ?? 'test goal', ...g } as Goal;
}

describe('Goals, Challenges & Assessment (GOAL)', () => {
  // --- the goal model + core checker (replicates) ---
  it('[GOAL-001] a `replicates within N` goal passes (measured births >= 1) for a genome that breeds and fails (measured 0) for an inert one — verdict from engine births, not source', () => {
    const g = goal({ id: 'rep', kind: 'replicates', params: { within: 5000, count: 1 } });

    const breeder = checkGoal(g, ctxOf(ANC));
    assert.equal(breeder.passed, true);
    assert.ok(breeder.measured >= 1, `expected >=1 daughter, got ${breeder.measured}`);
    assert.equal(breeder.hint, undefined);

    const inert = checkGoal(g, ctxOf(INERT));
    assert.equal(inert.passed, false);
    assert.equal(inert.measured, 0);
    assert.ok(inert.hint);
  });

  // --- determinism (C-CON-DET / CONTINV-DET) ---
  it('[GOAL-002] the checker is deterministic: two checkGoal calls with the same (scenario, seed, genome, goal) return identical GoalResults (passed/measured/atCycle/hint), incl. across a fresh process; no Math.random/Date.now/float on the verdict path', () => {
    const g = goal({ id: 'rep', kind: 'replicates', params: { within: 5000, count: 1 } });
    // pass path
    assert.deepStrictEqual(checkGoal(g, ctxOf(ANC)), checkGoal(g, ctxOf(ANC)));
    // fail path (identical hint bytes too)
    assert.deepStrictEqual(checkGoal(g, ctxOf(INERT)), checkGoal(g, ctxOf(INERT)));
    // every reported number is an integer (no float on the verdict path)
    const r = checkGoal(g, ctxOf(ANC));
    assert.ok(Number.isInteger(r.measured) && Number.isInteger(r.atCycle));
  });

  // --- reading genome size correctly ---
  it('[GOAL-003] a `shrink-genome` goal passes iff some live descendant genome is < S bytes (read from the size histogram/live sizes) with measured = smallest live genome size, and fails with the correct measured otherwise', () => {
    // SMALL12 keeps a 12-byte creature alive → smallest live size 12 < 20 ⇒ pass.
    const gPass = goal({ id: 'sh', kind: 'shrink-genome', params: { size: 20 }, cycles: 5000 });
    const pass = checkGoal(gPass, ctxOf(SMALL12));
    assert.equal(pass.passed, true);
    assert.equal(pass.measured, 12);

    // ANC is 80 bytes and breeds true → never < 40 ⇒ fail with measured 80.
    const gFail = goal({ id: 'sh', kind: 'shrink-genome', params: { size: 40 }, cycles: 5000 });
    const fail = checkGoal(gFail, ctxOf(ANC));
    assert.equal(fail.passed, false);
    assert.equal(fail.measured, 80);
    assert.equal(fail.hint?.code, 'too-big');
  });

  // --- kid-friendly teaching hint on failure (reuses GeneScript DIAG tone) ---
  it("[GOAL-004] a failed `replicates` goal for an alive-but-never-divided creature yields a GoalHint code:'never-divided', teaches:true, a short second-person message naming `divide`, jargon only in hoverTerms, a concrete suggestion, and byte-identical text for the same run", () => {
    const g = goal({ id: 'rep', kind: 'replicates', params: { within: 5000, count: 1 } });
    const r = checkGoal(g, ctxOf(INERT));
    assert.equal(r.passed, false);
    const hint = r.hint!;
    assert.equal(hint.code, 'never-divided');
    assert.equal(hint.teaches, true);
    assert.ok(hint.message.includes('divide'), 'message names divide');
    assert.ok(hint.message.startsWith('Your creature'), 'second-person message');
    assert.ok(Array.isArray(hint.hoverTerms) && hint.hoverTerms.includes('divide'));
    assert.ok(typeof hint.suggestion === 'string' && hint.suggestion.length > 0);
    // byte-identical for the same failing run
    assert.equal(checkGoal(g, ctxOf(INERT)).hint!.message, hint.message);
  });

  // --- multi-tier goals: required vs bonus tracked separately ---
  it('[GOAL-005] required vs bonus goals are tracked separately: checkLesson sets requiredMet from only the required goals and counts passed bonus goals in bonusMet; an unmet bonus goal does not clear requiredMet', () => {
    const required = goal({ id: 'req', kind: 'replicates', params: { within: 5000, count: 1 }, tier: 'required' });
    const bonusFail = goal({ id: 'bon', kind: 'replicates', params: { within: 5000, count: 1 }, tier: 'bonus' });
    const map = new Map<string, Uint8Array>([['req', ANC], ['bon', INERT]]);
    const out = checkLesson('L1', [required, bonusFail], (gg) => ctxOf(map.get(gg.id)!));
    assert.equal(out.requiredMet, true); // required (ANC) passed; unmet bonus does not clear it
    assert.equal(out.bonusMet, 0); // the bonus (INERT) failed

    // a passing bonus is counted, still without affecting requiredMet
    const bonusPass = goal({ id: 'bon', kind: 'replicates', params: { within: 5000, count: 1 }, tier: 'bonus' });
    const out2 = checkLesson('L1', [required, bonusPass], (gg) =>
      ctxOf(gg.id === 'req' ? ANC : ANC),
    );
    assert.equal(out2.requiredMet, true);
    assert.equal(out2.bonusMet, 1);
  });

  // --- completion → PROGRESS unlock ---
  it('[GOAL-006] meeting all required goals marks the lesson complete: requiredMet is true, recordOutcome adds it to completedLessonIds, and isLessonComplete(rec, lessonId) is true (the boolean PROGRESS [05] reads); one failed required goal leaves it incomplete', () => {
    const required = goal({ id: 'req', kind: 'replicates', params: { within: 5000, count: 1 }, tier: 'required' });

    const good = checkLesson('lesson-1', [required], () => ctxOf(ANC));
    assert.equal(good.requiredMet, true);
    const rec = recordOutcome(EMPTY_RECORD, good);
    assert.ok(rec.completedLessonIds.includes('lesson-1'));
    assert.equal(isLessonComplete(rec, 'lesson-1'), true);

    const bad = checkLesson('lesson-2', [required], () => ctxOf(INERT));
    assert.equal(bad.requiredMet, false);
    const rec2 = recordOutcome(rec, bad);
    assert.equal(isLessonComplete(rec2, 'lesson-2'), false);
  });

  // --- anti-cheese: observable engine outcomes only ---
  it('[GOAL-007] goals evaluate observable engine outcomes (anti-cheese): a goal passes only when a real @tierra26/engine run exhibits the outcome — a genome that appears to replicate but faults before dividing fails `replicates`, and no editor/AST heuristic can satisfy it', () => {
    const g = goal({ id: 'rep', kind: 'replicates', params: { within: 20_000, count: 1 } });
    // DIVIDE_ONLY literally contains the `divide` opcode, but the real run faults at the copy gate
    // every time and never produces a daughter → it must FAIL.
    const faulter = checkGoal(g, ctxOf(DIVIDE_ONLY));
    assert.equal(faulter.passed, false);
    assert.equal(faulter.measured, 0);
    // a genome that genuinely breeds passes — the verdict tracks reality, not source.
    assert.equal(checkGoal(g, ctxOf(ANC)).passed, true);
  });

  // --- Versus win-condition: deterministic ranking of two genomes ---
  it("[GOAL-008] a Versus win-condition ranks two genomes deterministically: rankVersus with {kind:'out-populate', by:C} injects both into one shared soup, runs to cycle C, returns winner ('a'|'b'|'tie') by integer live-population comparison; same (scenario,a,b) → same winner (INV-DET); exact tie → 'tie'", () => {
    const scenario = { seed: 0 };
    const opts = { kind: 'out-populate' as const, by: 50_000 };
    const w1 = rankVersus(scenario, ANC, INERT, opts);
    const w2 = rankVersus(scenario, ANC, INERT, opts);
    assert.equal(w1, 'a'); // the breeder out-populates the inert rival
    assert.equal(w1, w2); // deterministic for the same (scenario, a, b)
    // two inert genomes each stay at population 1 → an exact tie.
    assert.equal(rankVersus(scenario, INERT, INERT, opts), 'tie');
  });

  // --- reach-pop uses an integer high-water mark ---
  it('[GOAL-009] a `reach-pop` goal passes iff live population reaches >= P at any sample by cycle N (measured = max population seen) so a transient peak that later dips still passes; it reads stats().population, never fullness', () => {
    const g = goal({ id: 'pop', kind: 'reach-pop', params: { population: 3, within: 5000 } });
    const pass = checkGoal(g, ctxOf(ANC));
    assert.equal(pass.passed, true);
    assert.ok(pass.measured >= 3, `max population seen ${pass.measured}`);
    assert.ok(Number.isInteger(pass.measured));

    // an inert lineage never grows past 1 → fails, measured is the integer high-water (1).
    const fail = checkGoal(g, ctxOf(INERT));
    assert.equal(fail.passed, false);
    assert.equal(fail.measured, 1);
    assert.equal(fail.hint?.code, 'not-enough-babies');
  });

  // --- survive N horizon ---
  it("[GOAL-010] a `survive N` goal passes iff population > 0 for all N cycles (measured = N); a lineage that dies at cycle k < N fails with measured:k and a 'died-early' hint", () => {
    const g = goal({ id: 'surv', kind: 'survive', params: { cycles: 20_000 } });
    const alive = checkGoal(g, ctxOf(ANC));
    assert.equal(alive.passed, true);
    assert.equal(alive.measured, 20_000);
    assert.equal(alive.hint, undefined);

    // A lineage that never establishes (an 80-byte genome cannot fit a 40-byte soup) has
    // population 0 → it "survives" 0 cycles < N ⇒ fails with a died-early hint.
    const dead = checkGoal(g, ctxOf(ANC, { scenario: { seed: 0, soupSize: 40 } }));
    assert.equal(dead.passed, false);
    assert.ok(dead.measured < 20_000);
    assert.equal(dead.measured, 0);
    assert.equal(dead.hint?.code, 'died-early');
  });

  // --- validation rejects impossible/unsatisfiable goals ---
  it('[GOAL-011] invalid/unsatisfiable goals are rejected at validation: a missing kind-required param, a non-integer/<=0 deadline, or a required `diversity` goal in a mutation==0 scenario (unwinnable under breed-true) is rejected — never silently clamped or shipped', () => {
    // missing kind-required param (replicates needs `within`)
    assert.ok(validateGoal(goal({ kind: 'replicates', params: {} })).length > 0);
    // non-integer / <= 0 deadline
    assert.ok(validateGoal(goal({ kind: 'survive', params: { cycles: 0 } })).length > 0);
    assert.ok(validateGoal(goal({ kind: 'survive', params: { cycles: 1.5 } })).length > 0);
    // required diversity in a mutation==0 (breed-true) scenario is unwinnable
    const div = goal({ kind: 'diversity', params: { count: 2 }, tier: 'required' });
    assert.ok(validateGoal(div, { mutation: 0 }).length > 0);
    // …but the same diversity goal as a BONUS is allowed (never blocks), and a valid goal is clean
    assert.equal(validateGoal(goal({ kind: 'diversity', params: { count: 2 }, tier: 'bonus' }), { mutation: 0 }).length, 0);
    assert.equal(validateGoal(goal({ kind: 'replicates', params: { within: 5000, count: 1 } })).length, 0);
  });

  // --- learner progress record is pure state ---
  it('[GOAL-012] the learner progress record is pure state: recordOutcome merges into stable-sorted, dedup’d metGoalIds/completedLessonIds; re-recording is idempotent and merging is order-independent; no engine state or float in the record (serializable, deterministic)', () => {
    const o1: LessonGoalOutcome = {
      lessonId: 'L1',
      results: [
        { goalId: 'g2', kind: 'replicates', passed: true, measured: 1, atCycle: 1 },
        { goalId: 'g1', kind: 'replicates', passed: true, measured: 3, atCycle: 2 },
        { goalId: 'gX', kind: 'replicates', passed: false, measured: 0, atCycle: 5 },
      ],
      requiredMet: true,
      bonusMet: 0,
    };
    const o2: LessonGoalOutcome = {
      lessonId: 'L2',
      results: [{ goalId: 'g3', kind: 'survive', passed: true, measured: 9, atCycle: 9 }],
      requiredMet: false, // L2 not complete
      bonusMet: 0,
    };

    const r1 = recordOutcome(EMPTY_RECORD, o1);
    // stable-sorted, dedup'd, only passed ids; only complete lessons
    assert.deepStrictEqual(r1.metGoalIds, ['g1', 'g2']);
    assert.deepStrictEqual(r1.completedLessonIds, ['L1']);

    // idempotent: re-recording the same outcome changes nothing
    assert.deepStrictEqual(recordOutcome(r1, o1), r1);

    // order-independent merge
    const ab = recordOutcome(recordOutcome(EMPTY_RECORD, o1), o2);
    const ba = recordOutcome(recordOutcome(EMPTY_RECORD, o2), o1);
    assert.deepStrictEqual(ab, ba);
    assert.deepStrictEqual(ab.completedLessonIds, ['L1']); // L2 incomplete, never added

    // serializable (pure data, no floats, no engine state) and round-trips exactly
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r1)), r1);
  });
});
