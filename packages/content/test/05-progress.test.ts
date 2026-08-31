// Learning Progression & Unlocks (PROGRESS) — acceptance tests.
// Ref: docs/spec/content/05-learning-progression-and-unlocks.md §8.
// Conventions: engine anchor docs/spec/engine/systems/00-architecture.md §8.3.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allVerbs } from '../../genescript/src/vocab.ts';
import type { Curriculum, LearnerState, LessonId } from '../src/types.ts';
import {
  CURRICULUM,
  computeUnlocked,
  activeSubset,
  cumulativeUnlocks,
  prerequisiteClosure,
  topoOrder,
  introLessonOf,
} from '../src/progress.ts';

const REPLICATION_VERBS = ['make-space', 'copy-byte', 'divide'] as const;
const EMERGENCE_CONCEPTS = ['mutation', 'selection', 'parasite', 'immunity', 'arms-race'] as const;

function lessonIds(cur: Curriculum): LessonId[] {
  return Object.keys(cur.lessons).sort();
}
function state(completed: Iterable<LessonId>, sandbox?: boolean): LearnerState {
  return { completed: new Set(completed), sandbox };
}
function isSubset<T>(a: Iterable<T>, b: ReadonlySet<T> | Set<T>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

describe('Learning Progression & Unlocks (PROGRESS)', () => {
  it('[PROGRESS-001] the prerequisite graph is a DAG: no lesson is in its own prereq closure; topoOrder succeeds and a cyclic graph fails loudly (never loops)', () => {
    // No lesson in its own closure.
    for (const id of lessonIds(CURRICULUM)) {
      assert.ok(!prerequisiteClosure(CURRICULUM, id).has(id), `${id} in own closure`);
    }
    // topoOrder succeeds and lists every lesson exactly once.
    const order = topoOrder(CURRICULUM);
    assert.equal(order.length, lessonIds(CURRICULUM).length);
    assert.deepEqual([...order].sort(), lessonIds(CURRICULUM));
    // A cyclic graph fails loudly rather than looping.
    const cyclic: Curriculum = {
      chapters: [],
      lessons: {
        a: { id: 'a', chapter: 1, title: 'a', requires: ['b'], unlocks: { verbs: [], concepts: [] }, mutation: 'off', uses: { verbs: [], concepts: [] } },
        b: { id: 'b', chapter: 1, title: 'b', requires: ['a'], unlocks: { verbs: [], concepts: [] }, mutation: 'off', uses: { verbs: [], concepts: [] } },
      },
    };
    assert.throws(() => topoOrder(cyclic), /cycle/i);
  });

  it('[PROGRESS-002] every id in a lesson requires[] resolves to an existing lesson (no dangling prerequisite edges)', () => {
    for (const id of lessonIds(CURRICULUM)) {
      for (const p of CURRICULUM.lessons[id]!.requires) {
        assert.ok(CURRICULUM.lessons[p] !== undefined, `${id} requires missing ${p}`);
      }
    }
  });

  it('[PROGRESS-003] for completed = empty, available == exactly the root lessons (empty requires[]) and unlocked verbs/concepts/subset are empty', () => {
    const u = computeUnlocked(CURRICULUM, state([]));
    const roots = lessonIds(CURRICULUM).filter((id) => CURRICULUM.lessons[id]!.requires.length === 0);
    assert.deepEqual([...u.available].sort(), roots.sort());
    assert.equal(u.verbs.size, 0);
    assert.equal(u.concepts.size, 0);
    assert.deepEqual(u.subset, []);
  });

  it('[PROGRESS-004] for every lesson, uses.verbs subset of cumulative(lesson).verbs and uses.concepts subset of cumulative(lesson).concepts (CONTINV-INTRO-BEFORE-USE / C-CON-SUBSET)', () => {
    for (const id of lessonIds(CURRICULUM)) {
      const cum = cumulativeUnlocks(CURRICULUM, id);
      const verbs = new Set(cum.verbs);
      const concepts = new Set(cum.concepts);
      const l = CURRICULUM.lessons[id]!;
      assert.ok(isSubset(l.uses.verbs, verbs), `${id} uses a verb it does not unlock: ${l.uses.verbs.filter((v) => !verbs.has(v))}`);
      assert.ok(isSubset(l.uses.concepts, concepts), `${id} uses a concept it does not unlock: ${l.uses.concepts.filter((c) => !concepts.has(c))}`);
    }
  });

  it('[PROGRESS-005] cumulative unlocks are monotonic along any prereq path: cumulative(prereq) subset of cumulative(lesson), for verbs and concepts', () => {
    for (const id of lessonIds(CURRICULUM)) {
      const cum = cumulativeUnlocks(CURRICULUM, id);
      const verbs = new Set(cum.verbs);
      const concepts = new Set(cum.concepts);
      for (const p of prerequisiteClosure(CURRICULUM, id)) {
        const pc = cumulativeUnlocks(CURRICULUM, p);
        assert.ok(isSubset(pc.verbs, verbs), `${p} verbs not subset of ${id}`);
        assert.ok(isSubset(pc.concepts, concepts), `${p} concepts not subset of ${id}`);
      }
    }
  });

  it('[PROGRESS-006] the active subset equals the sorted union of unlocked verbs: activeSubset(l) === sort(cumulative(l).verbs), no extra and none missing', () => {
    for (const id of lessonIds(CURRICULUM)) {
      const cum = cumulativeUnlocks(CURRICULUM, id);
      const expected = [...new Set(cum.verbs)].sort();
      assert.deepEqual(activeSubset(CURRICULUM, id), expected);
    }
  });

  it('[PROGRESS-007] design->emergence ordering: every mutation:on lesson comes after (topologically) a lesson unlocking the replication verbs (make-space, copy-byte, divide)', () => {
    const order = topoOrder(CURRICULUM);
    const pos = new Map(order.map((id, i) => [id, i]));
    // Topological index by which each replication verb is first unlocked.
    const replUnlockPos = REPLICATION_VERBS.map((v) => {
      const intro = introLessonOf(v);
      assert.ok(intro !== undefined, `no introducer for ${v}`);
      return pos.get(intro!)!;
    });
    const lastReplPos = Math.max(...replUnlockPos);
    for (const id of order) {
      if (CURRICULUM.lessons[id]!.mutation === 'on') {
        assert.ok(pos.get(id)! > lastReplPos, `${id} runs mutation:on before replication is taught`);
      }
    }
  });

  it('[PROGRESS-008] sandbox unlocks all: computeUnlocked({sandbox:true}) yields the full classic-32 verbs, all concepts, full subset, and every lesson available, independent of completed (gate, not hard-lock)', () => {
    const all32 = allVerbs().map((v) => v.verb).sort();
    assert.equal(all32.length, 32);
    // Independent of completed: try empty and a partial set.
    for (const completed of [[], ['ch03-allocate']]) {
      const u = computeUnlocked(CURRICULUM, state(completed as LessonId[], true));
      assert.deepEqual([...u.verbs].sort(), all32);
      assert.deepEqual(u.subset, all32);
      assert.deepEqual([...u.available].sort(), lessonIds(CURRICULUM));
      // All authored concepts present.
      const allConcepts = new Set<string>();
      for (const id of lessonIds(CURRICULUM)) for (const c of CURRICULUM.lessons[id]!.unlocks.concepts) allConcepts.add(c);
      assert.deepEqual([...u.concepts].sort(), [...allConcepts].sort());
    }
  });

  it('[PROGRESS-009] computeUnlocked is a pure function of (curriculum, learnerState): same completed set -> identical unlocks, no insertion-order/RNG/wall-clock dependence (C-CON-DET)', () => {
    const a = computeUnlocked(CURRICULUM, state(['ch01-landmarks', 'ch01-registers', 'ch01-bit-tricks']));
    // Same members, different insertion order.
    const b = computeUnlocked(CURRICULUM, state(['ch01-bit-tricks', 'ch01-registers', 'ch01-landmarks']));
    assert.deepEqual([...a.verbs].sort(), [...b.verbs].sort());
    assert.deepEqual([...a.concepts].sort(), [...b.concepts].sort());
    assert.deepEqual(a.subset, b.subset);
    assert.deepEqual([...a.available].sort(), [...b.available].sort());
  });

  it('[PROGRESS-010] chapter phase is monotonic in chapter order: design -> life -> emergence -> versus; no emergence/versus chapter precedes a design chapter', () => {
    const rank = { design: 0, life: 1, emergence: 2, versus: 3 } as const;
    const phases = CURRICULUM.chapters.map((c) => rank[c.phase]);
    for (let i = 1; i < phases.length; i++) {
      assert.ok(phases[i]! >= phases[i - 1]!, `phase regresses at chapter index ${i}`);
    }
  });

  it('[PROGRESS-011] each verb and each concept is unlocked by exactly one lesson (a single introducer, no ambiguous/duplicate introductions)', () => {
    const verbCount = new Map<string, number>();
    const conceptCount = new Map<string, number>();
    for (const id of lessonIds(CURRICULUM)) {
      for (const v of CURRICULUM.lessons[id]!.unlocks.verbs) verbCount.set(v, (verbCount.get(v) ?? 0) + 1);
      for (const c of CURRICULUM.lessons[id]!.unlocks.concepts) conceptCount.set(c, (conceptCount.get(c) ?? 0) + 1);
    }
    for (const [v, n] of verbCount) assert.equal(n, 1, `verb ${v} introduced ${n} times`);
    for (const [c, n] of conceptCount) assert.equal(n, 1, `concept ${c} introduced ${n} times`);
    // And every one of the 32 verbs has exactly one introducer.
    const all32 = allVerbs().map((v) => v.verb).sort();
    for (const v of all32) assert.equal(verbCount.get(v), 1, `verb ${v} not introduced exactly once`);
    assert.equal([...verbCount.keys()].sort().join(','), all32.join(','));
  });

  it('[PROGRESS-012] emergence-phase concepts (mutation, selection, parasite, immunity, arms-race) are unlocked only in emergence/versus chapters, never in design/life', () => {
    const phaseOfLesson = new Map<LessonId, string>();
    for (const ch of CURRICULUM.chapters) for (const lid of ch.lessons) phaseOfLesson.set(lid, ch.phase);
    for (const concept of EMERGENCE_CONCEPTS) {
      let introducer: LessonId | undefined;
      for (const id of lessonIds(CURRICULUM)) {
        if (CURRICULUM.lessons[id]!.unlocks.concepts.includes(concept)) introducer = id;
      }
      assert.ok(introducer !== undefined, `no introducer for concept ${concept}`);
      const phase = phaseOfLesson.get(introducer!);
      assert.ok(phase === 'emergence' || phase === 'versus', `${concept} unlocked in ${phase} phase`);
    }
  });

  it('[PROGRESS-013] activeSubset(l) is order-independent: folding cumulative unlocks in any valid topological order yields the identical subset', () => {
    for (const id of lessonIds(CURRICULUM)) {
      const once = activeSubset(CURRICULUM, id);
      // Recompute via an explicit closure fold in a shuffled order.
      const members = [...prerequisiteClosure(CURRICULUM, id), id];
      const verbs = new Set<string>();
      for (const m of members.reverse()) for (const v of CURRICULUM.lessons[m]!.unlocks.verbs) verbs.add(v);
      assert.deepEqual([...verbs].sort(), [...once]);
    }
  });

  it('[PROGRESS-014] completing an already-completed lesson is idempotent: unlocked sets and available are unchanged (set semantics)', () => {
    const base = computeUnlocked(CURRICULUM, state(['ch01-landmarks', 'ch01-registers']));
    const dup = computeUnlocked(CURRICULUM, state(['ch01-landmarks', 'ch01-registers', 'ch01-landmarks']));
    assert.deepEqual([...base.verbs].sort(), [...dup.verbs].sort());
    assert.deepEqual([...base.concepts].sort(), [...dup.concepts].sort());
    assert.deepEqual(base.subset, dup.subset);
    assert.deepEqual([...base.available].sort(), [...dup.available].sort());
  });

  it('[PROGRESS-015] completing all of a lesson prerequisites makes that lesson appear in available deterministically, and it is absent while any prerequisite is incomplete', () => {
    const target: LessonId = 'ch01-bit-tricks'; // requires ch01-registers <- ch01-landmarks
    const prereqs = [...prerequisiteClosure(CURRICULUM, target)];
    // All direct prereqs complete -> available.
    const withAll = computeUnlocked(CURRICULUM, state(['ch01-landmarks', 'ch01-registers']));
    assert.ok(withAll.available.has(target));
    // Missing a direct prerequisite -> absent.
    const withMissing = computeUnlocked(CURRICULUM, state(['ch01-landmarks']));
    assert.ok(!withMissing.available.has(target));
    assert.ok(prereqs.includes('ch01-registers'));
  });

  it('[PROGRESS-016] prerequisiteClosure(l) is the exact transitive requires reachability of l and never includes l itself', () => {
    const c = prerequisiteClosure(CURRICULUM, 'ch02-measure');
    // ch02-measure <- ch02-find <- ch01-bit-tricks <- ch01-registers <- ch01-landmarks
    assert.deepEqual(
      [...c].sort(),
      ['ch01-bit-tricks', 'ch01-landmarks', 'ch01-registers', 'ch02-find'].sort(),
    );
    assert.ok(!c.has('ch02-measure'));
    // Root lesson has an empty closure.
    assert.equal(prerequisiteClosure(CURRICULUM, 'ch01-landmarks').size, 0);
  });

  it('[PROGRESS-017] the full curriculum is sound end-to-end: DAG (001) + edges resolve (002) + one introducer per verb/concept (011) + intro-before-use (004) — the shippable-curriculum gate', () => {
    // DAG + topo succeeds.
    assert.doesNotThrow(() => topoOrder(CURRICULUM));
    // Edges resolve.
    for (const id of lessonIds(CURRICULUM)) {
      for (const p of CURRICULUM.lessons[id]!.requires) assert.ok(CURRICULUM.lessons[p] !== undefined);
    }
    // One introducer per verb/concept, and every 32 verbs resolves through introLessonOf.
    const all32 = allVerbs().map((v) => v.verb);
    for (const v of all32) {
      const intro = introLessonOf(v);
      assert.ok(intro !== undefined, `introLessonOf(${v}) is undefined`);
      assert.ok(CURRICULUM.lessons[intro!]!.unlocks.verbs.includes(v));
    }
    // Intro-before-use.
    for (const id of lessonIds(CURRICULUM)) {
      const cum = cumulativeUnlocks(CURRICULUM, id);
      assert.ok(isSubset(CURRICULUM.lessons[id]!.uses.verbs, new Set(cum.verbs)));
      assert.ok(isSubset(CURRICULUM.lessons[id]!.uses.concepts, new Set(cum.concepts)));
    }
  });
});
