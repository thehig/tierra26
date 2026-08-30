# Learning Progression & Unlocks — Engineering Spec              (Code: PROGRESS · Milestone: M3)

**Status:** v1. Owns the **curriculum graph**: chapters and lessons, prerequisites, and what
each lesson *unlocks* (verbs, concepts) — and the pure function from *learner state* (which
lessons are completed) to *unlocked content* (which verbs/concepts/subset are available).
This is the machinery that gives the product its spine: the **design → emergence** arc
([`SPEC.md`](../SPEC.md) §5) laid out as an ordered, topologically-sound graph, computing the
**active instruction subset** that the engine's named-subset mechanism, the GeneScript
compiler, its block palette, and keyword availability all consume.

Upstream: [`SPEC.md`](../SPEC.md) §5 (the design→emergence progression), §10 (progressive
disclosure of vocabulary), §15 (milestones); [`00-overview.md`](00-overview.md) §1
(design→emergence teaching spine), §3 (`unlocks`/`requires` frontmatter), §5 (cross-cutting
contracts, esp. **C-CON-SUBSET**), §6 (**CONTINV-INTRO-BEFORE-USE**);
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.1–3.2 (named instruction sets/masks
— the progression *drives which subset is active*), §3.3 (the classic-32 verbs a subset is
drawn from); [`../genescript/00-overview.md`](../genescript/00-overview.md) §5 (**C-GS-SUBSET**
— compiler rejects locked verbs), [`../genescript/07-block-form.md`](../genescript/07-block-form.md)
§4 (block **palette** gated by the active subset).

Conforms to the engine anchor [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md)
§8 (doc template §8.1, append-only criterion IDs §8.2, `it.todo` test conventions §8.3,
fidelity tags §8.4). Companion pending-test file: `packages/content/test/05-progress.test.ts`.

**Contracts obeyed:** **C-CON-SUBSET** (a lesson's active subset ⊆ verbs unlocked by its
prerequisites; PROGRESS is the *enforcer* GOAL/PLAY respect); **C-CON-DATA** (the graph is
declarative data validated against a schema — no executable authoring); **C-CON-DET** (state →
unlocked-content is a pure, deterministic function). Enforces the global invariant
**CONTINV-INTRO-BEFORE-USE** (every verb/concept a lesson uses is introduced by it or a
prerequisite → the graph is topologically sound).

---

## 1. Purpose & responsibility

This system owns the **curriculum as data** and the **logic that turns it into availability**.
Concretely it must guarantee:

- **A sound curriculum graph.** Chapters group lessons; each lesson declares `requires[]`
  (prerequisite lesson ids) and `unlocks {verbs, concepts}`. The prerequisite relation is a
  **DAG** (no cycles) and is **topologically sound**: nothing a lesson uses is used before it
  is introduced (CONTINV-INTRO-BEFORE-USE).
- **The active instruction subset for any lesson/playground.** The set of verbs available at a
  lesson is the **cumulative union** of everything unlocked along *any* path of its
  prerequisites plus its own unlocks. This computed subset is the single value that feeds the
  engine named-subset (ISA-VM §3.2), the GeneScript compiler's subset check (C-GS-SUBSET), the
  block palette (BLOCK-005), and keyword availability — one source, four consumers.
- **The design→emergence ordering.** The chapter/lesson order realizes the four-phase arc
  (design → life → emergence → Versus): authoring/replication lessons run with **mutation
  off**; mutation+selection (and the emergent phenomena) unlock only *after* replication is
  taught; Versus sits at the top. This ordering is a checkable property of the graph, not just
  a convention.
- **A deterministic learner-state model.** `completed: Set<lessonId>` → `unlocked
  {verbs, concepts, subset, lessons}` is a **pure function** (C-CON-DET): same completed set →
  same unlocks, always, with no hidden state, RNG, or wall-clock.
- **Gating without hard-locking.** Progression *guides* (a lesson is "available" once its
  prereqs are done) but never *imprisons*: a **sandbox / free-play mode** exposes the full
  classic-32 subset and all concepts regardless of completion, as an explicit, first-class
  option.

This doc is **data + a pure function**, not UI. It computes availability; the UI layer decides
how to *present* locked/available/completed lessons (greyed, teased, or hidden).

---

## 2. Interfaces

The curriculum is declarative data (the `unlocks`/`requires` frontmatter of [00] §3, lifted
into a typed graph) plus pure functions over it. No `@tierra26/engine` or `@tierra26/genescript`
imports — a computed subset is expressed as a **set of dictionary mnemonics / verb names**,
which those layers resolve to opcodes at their own boundary (mirrors C-GS-NOOPCODES).

```ts
type LessonId = string;   // e.g. 'ch02-first-copy'  (matches [01] frontmatter `id`)
type ChapterId = number;  // 1..N, the design→emergence ordering
type Verb = string;       // a GeneScript verb / classic-32 mnemonic name (NOT an opcode byte)
type Concept = string;    // a taught idea: 'daughter', 'copy-loop', 'selection', 'parasite'

// The four phases of the design→emergence arc (SPEC §5); each chapter has one.
type Phase = 'design' | 'life' | 'emergence' | 'versus';

interface Unlocks {
  verbs: readonly Verb[];        // GeneScript verbs newly introduced here
  concepts: readonly Concept[];  // ideas newly introduced here
}

interface Lesson {
  id: LessonId;
  chapter: ChapterId;
  title: string;
  requires: readonly LessonId[]; // prerequisite lessons (edges INTO this node)
  unlocks: Unlocks;              // what this lesson adds to the cumulative set
  mutation: 'off' | 'on';       // the engine mutation setting this lesson runs under (SPEC §5)
  uses: {                        // what the lesson's playground/goal actually references
    verbs: readonly Verb[];      // verbs a starter/solution genome or goal needs
    concepts: readonly Concept[];
  };
}

interface Chapter {
  id: ChapterId;
  title: string;
  phase: Phase;                  // design | life | emergence | versus
  lessons: readonly LessonId[];  // in-chapter order
}

interface Curriculum {
  chapters: readonly Chapter[];
  lessons: Readonly<Record<LessonId, Lesson>>;
}

// ---- The learner state model + the pure availability function ----

interface LearnerState {
  completed: ReadonlySet<LessonId>;  // the ONLY input that varies availability
  sandbox?: boolean;                 // free-play: everything unlocked (see §4.5)
}

interface Unlocked {
  verbs: ReadonlySet<Verb>;          // cumulative verbs available
  concepts: ReadonlySet<Concept>;    // cumulative concepts available
  subset: readonly Verb[];           // the ACTIVE INSTRUCTION SUBSET (sorted; = union of verbs)
  available: ReadonlySet<LessonId>;  // lessons whose requires[] ⊆ completed (the "next" set)
}

// Pure, deterministic (C-CON-DET). No RNG, no wall-clock, no I/O.
function computeUnlocked(cur: Curriculum, state: LearnerState): Unlocked;

// The active subset for authoring/playing a SPECIFIC lesson = cumulative unlocks of its
// prerequisite-closure ∪ its own unlocks. Independent of learner completion (a lesson defines
// its own subset), so playgrounds are reproducible for everyone (C-CON-DET / C-CON-SUBSET).
function activeSubset(cur: Curriculum, lesson: LessonId): readonly Verb[];

// Graph queries used by validation and the UI.
function prerequisiteClosure(cur: Curriculum, lesson: LessonId): ReadonlySet<LessonId>;
function topoOrder(cur: Curriculum): readonly LessonId[];   // throws/returns error if cyclic
```

Consumers: the engine receives `activeSubset(...)` as a **named subset** (ISA-VM §3.2); the
GeneScript compiler receives it to enforce **C-GS-SUBSET**; block form receives it as
`palette(activeSet)` (BLOCK-005); the keyword UI shows only unlocked terms. GOAL [06] and
PLAY [02] read `activeSubset` and must never reference a verb outside it (C-CON-SUBSET).

---

## 3. Data structures

- **`Curriculum`** — the whole graph: an ordered `chapters[]` (chapter order = the
  design→emergence arc) and a `lessons` map keyed by id. Authored as content data ([00] §3
  frontmatter) and validated by [01]; this doc consumes the validated form.
- **Edges** — the prerequisite relation. An edge `p → l` exists for every `p ∈
  lessons[l].requires`. Edges point *from prerequisite to dependent* (topological direction).
  The graph is a **DAG**; `topoOrder` produces a linear extension.
- **`unlocks` (per lesson)** — the *delta*: verbs/concepts this lesson **first introduces**.
  Cumulative availability is a fold of deltas over a prerequisite path (§4.1). A verb/concept
  should be `unlocks`ed by exactly one lesson (its **introducer**) — no duplicate introductions
  (PROGRESS-011), so "where was this taught?" has one answer.
- **`uses` (per lesson)** — what the lesson's playground/goal actually *references*. The
  soundness invariant is `uses ⊆ cumulative-unlocks(prereq-closure ∪ self)` for both verbs and
  concepts (§4.4, CONTINV-INTRO-BEFORE-USE). `uses` is derivable/validated against the lesson's
  starter+solution genomes and its `<Goal>` (cross-checked in [01]/[06]); recorded here so the
  soundness check is local to the graph.
- **`mutation` (per lesson)** — the engine mutation setting (`off` in design/replication
  lessons; `on` from the emergence phase). Used to assert the arc ordering (§4.6).
- **`LearnerState`** — `completed` (the varying input) and optional `sandbox` (free-play). It
  holds **no** unlocked lists — those are *derived* every time, never stored (single source of
  truth; avoids drift). Integer/serializable so a learner's place is shareable/replayable.
- **`Unlocked`** — the derived view. `subset` is the **sorted** union of `verbs` (sorted for a
  deterministic, comparable value the engine/compiler can key on).

Invariants these hold:
- **DAG:** no lesson is in its own prerequisite closure (PROGRESS-001).
- **Monotonic unlocks:** along any prerequisite path, the cumulative verb/concept sets only
  grow (deltas are added, never removed) (PROGRESS-005).
- **Subset = union of verbs:** `Unlocked.subset` is exactly `sort(verbs)` — no verb in the
  subset that isn't in the unlocked verb set, and vice-versa (PROGRESS-006).

---

## 4. Behavior / algorithms

### 4.1 Cumulative unlocks (the fold)
The verbs/concepts available *at* a lesson `l` are the union of every introducer along its
prerequisite closure, plus `l`'s own `unlocks`:

```
cumulative(l) = unlocks(l) ∪ ( ⋃ over p ∈ prerequisiteClosure(l) )  unlocks(p)
```

`prerequisiteClosure(l)` = the transitive `requires` reachability of `l` (BFS/DFS over edges,
visited-set guarded). Because the graph is a DAG and `unlocks` are pure deltas, the fold is
**order-independent** (set union is commutative/associative) → the same cumulative set no
matter which topological order the fold visits (PROGRESS-005 monotonicity + PROGRESS-013
determinism).

### 4.2 `activeSubset(lesson)`
`activeSubset(l) = sort( cumulative(l).verbs )`. This is a property of the **lesson**, not the
learner — every learner opening lesson `l` (having necessarily completed its prereqs to reach
it, or in sandbox) sees the identical subset, so its playgrounds are reproducible for everyone
(C-CON-DET). This exact set is handed to the engine as a named subset, to the compiler
(C-GS-SUBSET), and to the block palette (BLOCK-005).

### 4.3 `computeUnlocked(state)` (the learner view)
```
if state.sandbox:  return everything (all classic-32 verbs, all concepts, full subset,
                   every lesson available)                                # §4.5
verbs, concepts := ∅, ∅
for each lesson id in state.completed:            # union the deltas of completed lessons
    verbs    ∪= unlocks(id).verbs
    concepts ∪= unlocks(id).concepts
subset    := sort(verbs)
available := { l | requires(l) ⊆ completed  and  l ∉ completed }   # the unlockable "next" set
return {verbs, concepts, subset, available}
```
Iteration is over a **sorted** view of `completed` and results are sets/sorted arrays, so the
function is deterministic regardless of set insertion order (C-CON-DET, PROGRESS-009/013).

### 4.4 Soundness check (CONTINV-INTRO-BEFORE-USE / C-CON-SUBSET)
For every lesson `l`, assert `uses(l).verbs ⊆ cumulative(l).verbs` **and** `uses(l).concepts ⊆
cumulative(l).concepts`. If a lesson's playground/goal references a verb/concept not unlocked
by it or a prerequisite, the curriculum is **unsound** — this is the check that guarantees the
graph is "topologically sound" (PROGRESS-004). It is the content-side twin of the engine
refusing an out-of-set opcode and the compiler's C-GS-SUBSET rejection.

### 4.5 Sandbox / free-play (gate, don't hard-lock)
`sandbox: true` short-circuits to **all classic-32 verbs, all concepts, the full subset, and
every lesson available** — progression *guides* the intended path but never *imprisons*
(SPEC §2 "a 15-year-old can drop to raw opcodes"). Free-play is thus a pure special case of the
same function, not a bypass around it (PROGRESS-008). (Playgrounds inside *authored lessons*
still pin their own `activeSubset` for reproducibility; sandbox governs the free editor/tank.)

### 4.6 Design→emergence ordering (arc soundness)
The chapter order + per-lesson `mutation` flag must realize SPEC §5:
- Every `mutation: 'on'` lesson comes **after** (in topological order) at least one lesson that
  unlocks the core replication verbs (`make-space`, `copy-byte`, `divide`) — you learn to build
  life before you watch it evolve (PROGRESS-007).
- Chapter `phase` is monotonic along the chapter order: `design` → `life` → `emergence` →
  `versus`; no `emergence`/`versus` chapter precedes a `design` chapter (PROGRESS-010).
- The concepts that *name* emergent phenomena (`mutation`, `selection`, `parasite`, `immunity`)
  are only unlocked in `emergence`/`versus` phase chapters (PROGRESS-012).

### 4.7 Proposed chapter outline (concrete, per SPEC §5)
Deliberately concrete so [01]/[02]/[06] align; exact lessons finalized during authoring (§9).
Verbs use the provisional GeneScript names (ISA-VM §3.3); mutation column = engine setting.

| Ch | Phase | Title (working) | Unlocks (verbs) | Unlocks (concepts) | Mut |
|---|---|---|---|---|---|
| 1 | design | Hello, soup | *mark-0, mark-1, grow-a, grow-b/c, shrink-c* | soup, cell, register, instruction-pointer, template/landmark | off |
| 2 | design | Find yourself | *find, find-back, find-forward, subtract* | address, self-location, size | off |
| 3 | design | Make a daughter | *make-space* | daughter, allocation, write-protection | off |
| 4 | design | Teach it to copy | *copy-byte, copy-a-to-b, copy-c-to-d, if-zero, jump, jump-back* | copy-loop, byte, loop, conditional | off |
| 5 | design | Give birth | *divide, call, return, save-\*/load-\** | replication, the 0.7 divide gate, stack | off |
| 6 | life | It fills the tank | *(none new — consolidation)* | population, scheduler/slicer, reaper, fullness | off |
| 7 | emergence | Turn on the copy errors | *(none new)* | mutation, flaw, copy-mutation, variation | **on** |
| 8 | emergence | Survival of the fittest | *(none new)* | selection, fitness, size-reduction, optimization | **on** |
| 9 | emergence | Parasites & arms races | *(none new)* | parasite, immunity, hyper-parasite, arms-race | **on** |
| 10 | versus | Versus | *(none new — raw/full subset)* | competition, win-condition, seed-replay | **on** |

Note the shape: **all verb unlocking happens in the design phase** (ch 1–5); the emergence and
versus phases unlock **concepts** (what to *watch for*) over the now-complete verb vocabulary,
with mutation on. This directly encodes design→emergence (PROGRESS-007/010/012).

---

## 5. Interconnections

- **[01] CONTENT** — parses/validates the `unlocks`/`requires`/`mutation` frontmatter into the
  `Curriculum` this doc consumes; PROGRESS supplies the *graph-level* soundness check on top of
  [01]'s per-lesson schema validation.
- **[02] PLAY** — a playground is configured with `subset: <lessonId>`; PLAY resolves it to
  `activeSubset(lesson)` and passes it to the engine as the named set. PLAY must not expose a
  verb outside it.
- **[06] GOAL** — a goal must not require a verb the lesson hasn't introduced (C-CON-SUBSET);
  PROGRESS's `uses`/soundness check (§4.4) is what guarantees GOAL can be honored.
- **`@tierra26/engine` (ISA §3.2)** — receives `activeSubset` as a **named instruction subset
  (mask)**; the progression is *what drives which subset is active*.
- **`@tierra26/genescript` COMP (C-GS-SUBSET)** — receives the same subset; rejects locked
  verbs with a friendly diagnostic. **BLOCK (BLOCK-005)** — `palette(activeSet)` shows only the
  subset's verbs; keyword availability in the editor tracks the same set.
- **CONTINV** (`_invariants.test.ts`) — CONTINV-INTRO-BEFORE-USE is the cross-layer statement
  of §4.4/PROGRESS-004.

The contract crossings: **one computed subset value, four consumers** (engine set, compiler
check, block palette, keyword UI) — they never each re-derive it, avoiding drift.

---

## 6. Determinism & edge cases

- **Purity (C-CON-DET).** `computeUnlocked`, `activeSubset`, `prerequisiteClosure`, `topoOrder`
  are pure functions of `(curriculum, input)`: no RNG, no `Date.now`, no map/insertion-order
  dependence (iterate sorted; return sorted arrays / sets). Same input → identical output
  (PROGRESS-009/013).
- **Cycle detection.** `topoOrder` on a cyclic `requires` graph must fail loudly (error /
  thrown at validation time), never loop or return a partial order (PROGRESS-001).
- **Missing prerequisite.** A `requires` id with no matching lesson is a validation error
  (dangling edge), surfaced by [01]; PROGRESS's queries treat the graph as malformed
  (PROGRESS-002).
- **Duplicate introduction.** A verb/concept unlocked by more than one lesson is flagged
  (ambiguous introducer) (PROGRESS-011).
- **Use-before-intro.** A `uses` entry outside the cumulative set is the core soundness failure
  (PROGRESS-004).
- **Empty state.** `completed = ∅` (a brand-new learner) → empty verbs/concepts, empty subset,
  and `available` = exactly the **root lessons** (no prerequisites) (PROGRESS-003).
- **Sandbox.** `sandbox: true` → full subset / all concepts / all lessons available,
  independent of `completed` (PROGRESS-008).
- **Idempotence.** Completing a lesson already in `completed` changes nothing (set semantics)
  (PROGRESS-014).

---

## 7. Fidelity notes

- **[MOD]** The curriculum graph and unlock model are a modern pedagogy layer with **no analog
  in original Tierra** — Tierra had no tutorial. What is faithful is the *substrate* they gate:
  the named-set/mask mechanism (ISA-VM §3.1, itself faithful to Tierra's dictionary-vs-active-set
  split) and the classic-32 verb inventory.
- **[CORE]** The **design→emergence arc** (SPEC §5) as the ordering principle — mutation-off
  authoring before mutation-on emergence — is a product-core commitment; the graph must encode
  it, not merely allow it.
- **[CORE]** Progression **gates but never hard-locks** (SPEC §2): the sandbox/full-subset
  escape hatch is required, not optional.
- **[OPTIONAL]** Richer progression affordances (per-learner recommended next lesson, badges,
  spaced-review scheduling, mastery thresholds beyond binary complete/incomplete) — layer on
  later; not required for correctness of the subset/unlock computation.

---

## 8. Acceptance criteria

- **PROGRESS-001** The curriculum prerequisite graph is a **DAG**: no lesson appears in its own
  prerequisite closure; `topoOrder` succeeds (a cyclic graph fails loudly, never loops).
- **PROGRESS-002** Every id in any lesson's `requires[]` resolves to an existing lesson (no
  dangling prerequisite edges).
- **PROGRESS-003** For `completed = ∅`, `available` is exactly the set of **root lessons**
  (lessons with empty `requires[]`), and unlocked verbs/concepts/subset are empty.
- **PROGRESS-004** For every lesson, `uses.verbs ⊆ cumulative(lesson).verbs` and
  `uses.concepts ⊆ cumulative(lesson).concepts` — no lesson uses a verb/concept not unlocked by
  it or a prerequisite (CONTINV-INTRO-BEFORE-USE / C-CON-SUBSET).
- **PROGRESS-005** Cumulative unlocks are **monotonic** along any prerequisite path: for
  prerequisite `p` of `l`, `cumulative(p).verbs ⊆ cumulative(l).verbs` (and likewise concepts) —
  the set only grows downstream.
- **PROGRESS-006** The computed **active subset equals the sorted union of unlocked verbs**:
  `activeSubset(l) == sort(cumulative(l).verbs)`; no verb is in the subset that isn't unlocked,
  and none unlocked is missing.
- **PROGRESS-007** **Design→emergence ordering:** every `mutation: 'on'` lesson comes after (in
  topological order) a lesson unlocking the core replication verbs (`make-space`, `copy-byte`,
  `divide`) — replication is taught before mutation is turned on.
- **PROGRESS-008** **Sandbox unlocks all:** `computeUnlocked(state with sandbox:true)` yields
  the full classic-32 verb set, all concepts, the full subset, and every lesson available —
  independent of `completed` (gate, don't hard-lock).
- **PROGRESS-009** `computeUnlocked` is a **pure function** of `(curriculum, learnerState)`:
  same completed set → identical unlocks, with no dependence on insertion order, RNG, or
  wall-clock (C-CON-DET).
- **PROGRESS-010** Chapter `phase` is monotonic in chapter order: `design → life → emergence →
  versus`; no `emergence`/`versus` chapter precedes a `design` chapter.
- **PROGRESS-011** Each verb and each concept is `unlocks`ed by **exactly one** lesson (a single
  introducer — no duplicate/ambiguous introductions).
- **PROGRESS-012** Emergence-phase concepts (`mutation`, `selection`, `parasite`, `immunity`,
  arms-race) are unlocked only in `emergence`/`versus` chapters, never in `design`/`life`.
- **PROGRESS-013** `activeSubset(l)` is **order-independent**: computing the cumulative fold in
  any valid topological order yields the identical subset.
- **PROGRESS-014** Completing an already-completed lesson is **idempotent**: it changes neither
  the unlocked sets nor `available` (set semantics).
- **PROGRESS-015** Completing all of a lesson's prerequisites makes that lesson appear in
  `available` **deterministically**, and it is absent while any prerequisite is incomplete.
- **PROGRESS-016** `prerequisiteClosure(l)` is the exact transitive `requires` reachability of
  `l` and never includes `l` itself.
- **PROGRESS-017** The full curriculum is **sound end-to-end**: it is a DAG (001), edges resolve
  (002), each verb/concept has one introducer (011), and every lesson passes intro-before-use
  (004) — the shippable-curriculum gate.

---

## 9. Open questions

1. **Completion criterion.** Is a lesson "completed" purely by its `<Goal>` passing [06], or can
   a learner mark it done manually (skip)? (Proposed: goal-pass, with an explicit skip that
   still records completion so downstream unlocks resolve — availability stays a pure function
   of `completed`.)
2. **Concept granularity.** How fine are `concept` tokens (one per keyword-worthy idea vs
   coarser themes)? Pin alongside the [04] keyword registry so concepts and keyword terms don't
   drift.
3. **Multiple valid paths.** The outline is near-linear; do we want genuinely branching optional
   chapters (e.g. an advanced "raw opcodes" side-track) whose unlocks merge cleanly? The DAG +
   monotonic-fold model already supports it; decide whether to author any.
4. **Sandbox subset granularity.** Does free-play always mean *full* classic-32, or can a
   scenario choose an intermediate subset? (Proposed: full by default; scenarios may pin a
   named subset for a themed sandbox.)
5. **Versus verb scope.** Does Versus (ch 10) formally unlock anything beyond the full subset
   (e.g. raw-opcode editing), or is it purely a mode over the already-complete vocabulary?
