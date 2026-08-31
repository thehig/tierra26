// ============================================================================
// [05] PROGRESS — curriculum graph + unlocks (data + pure functions).
// Ref: docs/spec/content/05-learning-progression-and-unlocks.md.
//
// Owns THE curriculum as a frozen constant (the design→emergence arc, §4.7)
// plus the pure, deterministic functions that turn learner state into unlocked
// content. No I/O at load; no RNG / wall-clock / insertion-order dependence
// (C-CON-DET). Data shapes are imported from the locked foundation (types.ts).
//
// --experimental-strip-types: no parameter properties, enums, decorators, or
// namespaces; `import type` for types.
// ============================================================================
import type {
  Curriculum,
  Chapter,
  Lesson,
  LessonId,
  Verb,
  Concept,
  Unlocks,
  LearnerState,
  Unlocked,
} from './types.ts';

// ----------------------------------------------------------------------------
// The shipped curriculum (§4.7 outline, real VOCAB verb names).
//
// All 32 verbs are unlocked across the DESIGN phase (ch 1–5); the LIFE,
// EMERGENCE, and VERSUS phases unlock only CONCEPTS over the now-complete verb
// vocabulary, with mutation turned on from ch 7. The graph is a near-linear DAG
// (each lesson depends on the previous), so it is trivially acyclic and every
// mutation:'on' lesson lands topologically after replication is taught.
// ----------------------------------------------------------------------------

function lesson(l: Lesson): Lesson {
  return l;
}

const LESSONS: Lesson[] = [
  // ---- Chapter 1 · design · Hello, soup ------------------------------------
  lesson({
    id: 'ch01-landmarks',
    chapter: 1,
    title: 'Landmarks in the soup',
    requires: [],
    unlocks: { verbs: ['mark-0', 'mark-1'], concepts: ['soup', 'cell', 'template', 'landmark'] },
    mutation: 'off',
    uses: { verbs: ['mark-0', 'mark-1'], concepts: ['soup', 'template', 'landmark'] },
  }),
  lesson({
    id: 'ch01-registers',
    chapter: 1,
    title: 'Four little boxes',
    requires: ['ch01-landmarks'],
    unlocks: { verbs: ['grow-a', 'grow-b', 'grow-c', 'shrink-c'], concepts: ['register', 'instruction-pointer'] },
    mutation: 'off',
    uses: { verbs: ['grow-a', 'grow-c', 'shrink-c'], concepts: ['register', 'instruction-pointer'] },
  }),
  lesson({
    id: 'ch01-bit-tricks',
    chapter: 1,
    title: 'Flip, double, clear',
    requires: ['ch01-registers'],
    unlocks: { verbs: ['flip-bit', 'double', 'clear'], concepts: ['byte', 'bit'] },
    mutation: 'off',
    uses: { verbs: ['flip-bit', 'double', 'clear'], concepts: ['byte', 'bit', 'register'] },
  }),

  // ---- Chapter 2 · design · Find yourself ----------------------------------
  lesson({
    id: 'ch02-find',
    chapter: 2,
    title: 'Find yourself',
    requires: ['ch01-bit-tricks'],
    unlocks: { verbs: ['find', 'find-back', 'find-forward'], concepts: ['address', 'self-location'] },
    mutation: 'off',
    uses: { verbs: ['find', 'find-forward'], concepts: ['address', 'self-location', 'landmark'] },
  }),
  lesson({
    id: 'ch02-measure',
    chapter: 2,
    title: 'How big am I?',
    requires: ['ch02-find'],
    unlocks: { verbs: ['subtract', 'subtract-into-a'], concepts: ['size', 'subtraction'] },
    mutation: 'off',
    uses: { verbs: ['subtract', 'find'], concepts: ['size', 'subtraction', 'address'] },
  }),

  // ---- Chapter 3 · design · Make a daughter --------------------------------
  lesson({
    id: 'ch03-allocate',
    chapter: 3,
    title: 'Ask for a baby',
    requires: ['ch02-measure'],
    unlocks: { verbs: ['make-space'], concepts: ['daughter', 'allocation', 'write-protection'] },
    mutation: 'off',
    uses: { verbs: ['make-space'], concepts: ['daughter', 'allocation', 'size'] },
  }),

  // ---- Chapter 4 · design · Teach it to copy -------------------------------
  lesson({
    id: 'ch04-copy-byte',
    chapter: 4,
    title: 'Copy one byte',
    requires: ['ch03-allocate'],
    unlocks: { verbs: ['copy-byte'], concepts: ['byte-copy'] },
    mutation: 'off',
    uses: { verbs: ['copy-byte', 'make-space'], concepts: ['byte-copy', 'daughter'] },
  }),
  lesson({
    id: 'ch04-loop',
    chapter: 4,
    title: 'The copy loop',
    requires: ['ch04-copy-byte'],
    unlocks: { verbs: ['if-zero', 'jump', 'jump-back'], concepts: ['copy-loop', 'loop', 'conditional'] },
    mutation: 'off',
    uses: { verbs: ['copy-byte', 'if-zero', 'jump-back', 'shrink-c'], concepts: ['copy-loop', 'loop', 'conditional'] },
  }),
  lesson({
    id: 'ch04-move-regs',
    chapter: 4,
    title: 'Shuffle the boxes',
    requires: ['ch04-loop'],
    unlocks: { verbs: ['copy-c-to-d', 'copy-a-to-b'], concepts: ['move'] },
    mutation: 'off',
    uses: { verbs: ['copy-c-to-d', 'copy-a-to-b'], concepts: ['move', 'register'] },
  }),

  // ---- Chapter 5 · design · Give birth -------------------------------------
  lesson({
    id: 'ch05-divide',
    chapter: 5,
    title: 'Give birth',
    requires: ['ch04-move-regs'],
    unlocks: { verbs: ['divide'], concepts: ['replication', 'divide-gate'] },
    mutation: 'off',
    uses: { verbs: ['divide', 'make-space', 'copy-byte'], concepts: ['replication', 'divide-gate', 'daughter'] },
  }),
  lesson({
    id: 'ch05-subroutines',
    chapter: 5,
    title: 'Call and return',
    requires: ['ch05-divide'],
    unlocks: { verbs: ['call', 'return'], concepts: ['subroutine', 'stack'] },
    mutation: 'off',
    uses: { verbs: ['call', 'return'], concepts: ['subroutine', 'stack'] },
  }),
  lesson({
    id: 'ch05-save-load',
    chapter: 5,
    title: 'Save and load',
    requires: ['ch05-subroutines'],
    unlocks: {
      verbs: ['save-a', 'save-b', 'save-c', 'save-d', 'load-a', 'load-b', 'load-c', 'load-d'],
      concepts: ['save-restore'],
    },
    mutation: 'off',
    uses: { verbs: ['save-a', 'load-a'], concepts: ['save-restore', 'stack'] },
  }),

  // ---- Chapter 6 · life · It fills the tank --------------------------------
  lesson({
    id: 'ch06-population',
    chapter: 6,
    title: 'It fills the tank',
    requires: ['ch05-save-load'],
    unlocks: { verbs: [], concepts: ['population', 'scheduler', 'reaper', 'fullness'] },
    mutation: 'off',
    uses: {
      verbs: ['make-space', 'copy-byte', 'divide'],
      concepts: ['population', 'scheduler', 'reaper', 'fullness', 'replication'],
    },
  }),

  // ---- Chapter 7 · emergence · Turn on the copy errors ---------------------
  lesson({
    id: 'ch07-mutation',
    chapter: 7,
    title: 'Turn on the copy errors',
    requires: ['ch06-population'],
    unlocks: { verbs: [], concepts: ['mutation', 'flaw', 'copy-mutation', 'variation'] },
    mutation: 'on',
    uses: {
      verbs: ['copy-byte', 'divide'],
      concepts: ['mutation', 'flaw', 'copy-mutation', 'variation', 'replication'],
    },
  }),

  // ---- Chapter 8 · emergence · Survival of the fittest ---------------------
  lesson({
    id: 'ch08-selection',
    chapter: 8,
    title: 'Survival of the fittest',
    requires: ['ch07-mutation'],
    unlocks: { verbs: [], concepts: ['selection', 'fitness', 'size-reduction', 'optimization'] },
    mutation: 'on',
    uses: {
      verbs: ['divide'],
      concepts: ['selection', 'fitness', 'size-reduction', 'optimization', 'variation'],
    },
  }),

  // ---- Chapter 9 · emergence · Parasites & arms races ----------------------
  lesson({
    id: 'ch09-parasites',
    chapter: 9,
    title: 'Parasites and arms races',
    requires: ['ch08-selection'],
    unlocks: { verbs: [], concepts: ['parasite', 'immunity', 'hyper-parasite', 'arms-race'] },
    mutation: 'on',
    uses: {
      verbs: ['copy-byte', 'find'],
      concepts: ['parasite', 'immunity', 'hyper-parasite', 'arms-race', 'selection'],
    },
  }),

  // ---- Chapter 10 · versus · Versus ----------------------------------------
  lesson({
    id: 'ch10-versus',
    chapter: 10,
    title: 'Versus',
    requires: ['ch09-parasites'],
    unlocks: { verbs: [], concepts: ['competition', 'win-condition', 'seed-replay'] },
    mutation: 'on',
    uses: { verbs: ['divide'], concepts: ['competition', 'win-condition', 'seed-replay', 'selection'] },
  }),
];

const CHAPTERS: Chapter[] = [
  { id: 1, title: 'Hello, soup', phase: 'design', lessons: ['ch01-landmarks', 'ch01-registers', 'ch01-bit-tricks'] },
  { id: 2, title: 'Find yourself', phase: 'design', lessons: ['ch02-find', 'ch02-measure'] },
  { id: 3, title: 'Make a daughter', phase: 'design', lessons: ['ch03-allocate'] },
  { id: 4, title: 'Teach it to copy', phase: 'design', lessons: ['ch04-copy-byte', 'ch04-loop', 'ch04-move-regs'] },
  { id: 5, title: 'Give birth', phase: 'design', lessons: ['ch05-divide', 'ch05-subroutines', 'ch05-save-load'] },
  { id: 6, title: 'It fills the tank', phase: 'life', lessons: ['ch06-population'] },
  { id: 7, title: 'Turn on the copy errors', phase: 'emergence', lessons: ['ch07-mutation'] },
  { id: 8, title: 'Survival of the fittest', phase: 'emergence', lessons: ['ch08-selection'] },
  { id: 9, title: 'Parasites & arms races', phase: 'emergence', lessons: ['ch09-parasites'] },
  { id: 10, title: 'Versus', phase: 'versus', lessons: ['ch10-versus'] },
];

function buildLessonMap(list: readonly Lesson[]): Readonly<Record<LessonId, Lesson>> {
  const map: Record<LessonId, Lesson> = {};
  for (const l of list) map[l.id] = Object.freeze({ ...l });
  return Object.freeze(map);
}

export const CURRICULUM: Curriculum = Object.freeze({
  chapters: Object.freeze(CHAPTERS.map((c) => Object.freeze({ ...c }))),
  lessons: buildLessonMap(LESSONS),
});

// ----------------------------------------------------------------------------
// Small deterministic set helpers (sorted arrays where order matters).
// ----------------------------------------------------------------------------

function sortedUnique<T>(xs: Iterable<T>): T[] {
  return Array.from(new Set(xs)).sort();
}

function requireLesson(cur: Curriculum, id: LessonId): Lesson {
  const l = cur.lessons[id];
  if (l === undefined) throw new Error(`PROGRESS: unknown lesson id '${id}'`);
  return l;
}

// ----------------------------------------------------------------------------
// Graph queries.
// ----------------------------------------------------------------------------

/**
 * The exact transitive `requires` reachability of `lesson`, excluding the
 * lesson itself. BFS over prerequisite edges, visited-guarded (PROGRESS-016).
 * Throws on a dangling prerequisite edge (a `requires` id with no lesson).
 */
export function prerequisiteClosure(cur: Curriculum, lesson: LessonId): Set<LessonId> {
  const start = requireLesson(cur, lesson);
  const closure = new Set<LessonId>();
  const queue: LessonId[] = [...start.requires];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (closure.has(id)) continue;
    const l = requireLesson(cur, id); // dangling edge fails loudly (PROGRESS-002)
    closure.add(id);
    for (const p of l.requires) if (!closure.has(p)) queue.push(p);
  }
  closure.delete(lesson); // never include self (PROGRESS-016)
  return closure;
}

/**
 * A linear extension of the prerequisite DAG (Kahn's algorithm, ready nodes
 * drained in sorted order for determinism). Throws loudly on a cycle or a
 * dangling edge — never loops, never returns a partial order (PROGRESS-001).
 */
export function topoOrder(cur: Curriculum): LessonId[] {
  const ids = Object.keys(cur.lessons).sort();
  const indeg = new Map<LessonId, number>();
  const dependents = new Map<LessonId, LessonId[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    dependents.set(id, []);
  }
  for (const id of ids) {
    const l = cur.lessons[id]!;
    for (const p of l.requires) {
      if (cur.lessons[p] === undefined) {
        throw new Error(`PROGRESS: lesson '${id}' requires unknown lesson '${p}' (dangling edge)`);
      }
      indeg.set(id, indeg.get(id)! + 1);
      dependents.get(p)!.push(id);
    }
  }
  const ready = ids.filter((id) => indeg.get(id) === 0).sort();
  const order: LessonId[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const d of dependents.get(id)!.slice().sort()) {
      indeg.set(d, indeg.get(d)! - 1);
      if (indeg.get(d) === 0) {
        ready.push(d);
        ready.sort();
      }
    }
  }
  if (order.length !== ids.length) {
    const cyclic = ids.filter((id) => !order.includes(id)).sort();
    throw new Error(`PROGRESS: prerequisite graph has a cycle (unresolved: ${cyclic.join(', ')})`);
  }
  return order;
}

// ----------------------------------------------------------------------------
// Cumulative unlocks (the fold) — §4.1.
// ----------------------------------------------------------------------------

/**
 * The verbs/concepts available AT `lesson`: the union of every introducer along
 * its prerequisite closure, plus the lesson's own `unlocks`. Order-independent
 * (set union is commutative/associative), returned sorted (PROGRESS-005/013).
 */
export function cumulativeUnlocks(cur: Curriculum, lesson: LessonId): Unlocks {
  const self = requireLesson(cur, lesson);
  const verbs = new Set<Verb>(self.unlocks.verbs);
  const concepts = new Set<Concept>(self.unlocks.concepts);
  for (const id of prerequisiteClosure(cur, lesson)) {
    const l = cur.lessons[id]!;
    for (const v of l.unlocks.verbs) verbs.add(v);
    for (const c of l.unlocks.concepts) concepts.add(c);
  }
  return { verbs: sortedUnique(verbs), concepts: sortedUnique(concepts) };
}

/**
 * The active instruction subset for authoring/playing a SPECIFIC lesson: the
 * sorted union of the cumulative unlocks over its prerequisite-closure ∪ own
 * unlocks. A property of the lesson, not the learner — reproducible for
 * everyone (C-CON-DET / C-CON-SUBSET), order-independent (PROGRESS-006/013).
 */
export function activeSubset(cur: Curriculum, lesson: LessonId): readonly Verb[] {
  return cumulativeUnlocks(cur, lesson).verbs;
}

// ----------------------------------------------------------------------------
// The whole-curriculum verb / concept universe (for sandbox short-circuit).
// Derived from the graph itself (union of every lesson's unlocks) so there is
// no second source to drift — a complete curriculum yields the full classic-32.
// ----------------------------------------------------------------------------

function allVerbsOf(cur: Curriculum): Verb[] {
  const s = new Set<Verb>();
  for (const id of Object.keys(cur.lessons)) for (const v of cur.lessons[id]!.unlocks.verbs) s.add(v);
  return sortedUnique(s);
}

function allConceptsOf(cur: Curriculum): Concept[] {
  const s = new Set<Concept>();
  for (const id of Object.keys(cur.lessons)) for (const c of cur.lessons[id]!.unlocks.concepts) s.add(c);
  return sortedUnique(s);
}

// ----------------------------------------------------------------------------
// The learner view — §4.3. Pure/deterministic (C-CON-DET, PROGRESS-009).
// ----------------------------------------------------------------------------

/**
 * From learner state to unlocked content. `sandbox:true` short-circuits to
 * EVERYTHING (full verbs, all concepts, full subset, every lesson available),
 * independent of `completed` (gate, don't hard-lock — PROGRESS-008). Otherwise
 * unlocks are the cumulative deltas of the completed lessons, and `available`
 * is every not-yet-completed lesson whose `requires[]` ⊆ completed.
 */
export function computeUnlocked(cur: Curriculum, state: LearnerState): Unlocked {
  const ids = Object.keys(cur.lessons).sort();

  if (state.sandbox === true) {
    const verbs = allVerbsOf(cur);
    const concepts = allConceptsOf(cur);
    return {
      verbs: new Set(verbs),
      concepts: new Set(concepts),
      subset: verbs, // already sorted
      available: new Set(ids),
    };
  }

  // Iterate a SORTED view of `completed` so the result is insertion-order-free.
  const completed = Array.from(state.completed).sort();
  const verbs = new Set<Verb>();
  const concepts = new Set<Concept>();
  for (const id of completed) {
    const l = cur.lessons[id];
    if (l === undefined) continue; // unknown completed id contributes nothing
    for (const v of l.unlocks.verbs) verbs.add(v);
    for (const c of l.unlocks.concepts) concepts.add(c);
  }

  const completedSet = state.completed;
  const available = new Set<LessonId>();
  for (const id of ids) {
    if (completedSet.has(id)) continue; // l ∉ completed
    const l = cur.lessons[id]!;
    if (l.requires.every((p) => completedSet.has(p))) available.add(id);
  }

  return {
    verbs,
    concepts,
    subset: sortedUnique(verbs),
    available,
  };
}

// ----------------------------------------------------------------------------
// introLessonOf — the single lesson that introduces `verb`. INSTRPAGE [03]
// depends on this to wire each per-instruction page's `introLesson`.
// ----------------------------------------------------------------------------

const VERB_INTRODUCER: ReadonlyMap<Verb, LessonId> = (() => {
  const m = new Map<Verb, LessonId>();
  for (const id of Object.keys(CURRICULUM.lessons)) {
    for (const v of CURRICULUM.lessons[id]!.unlocks.verbs) m.set(v, id);
  }
  return m;
})();

/** The single lesson whose `unlocks.verbs` contains `verb`, or undefined. */
export function introLessonOf(verb: Verb): LessonId | undefined {
  return VERB_INTRODUCER.get(verb);
}
