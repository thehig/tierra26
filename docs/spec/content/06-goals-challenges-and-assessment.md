# Goals, Challenges & Assessment — Engineering Spec              (Code: GOAL · Milestone: M3)

**Status:** v1. Owns the **success conditions** for lessons and playgrounds — the declarative
**Goal model**, the **deterministic checker** that runs a scenario via `@tierra26/engine` and
evaluates the condition against stats/observation, the **pass/fail + progress semantics** that
drive lesson completion, the **kid-friendly failure hints** that teach, and the **learner
progress record** of which goals are met. It is also the Versus **win-condition** substrate: a
match outcome is a goal evaluated over a shared scenario.

**Upstream refs:**
[`00-overview.md`](00-overview.md) §3 (the `:::goal { kind, … }` directive embedded in a
lesson/playground), §5 (**C-CON-DET** — playground runs and goal-checks are deterministic;
**C-CON-SUBSET** — a goal never requires a verb the lesson hasn't introduced; **C-CON-KID** —
learner-facing tone; **C-CON-COMPILES**), §6 (**CONTINV-DET** — goal-checkers deterministic per
seed; **CONTINV-INTRO-BEFORE-USE**), §2 (the pipeline: `<Goal> conditions → 06 GOAL
deterministic pass/fail checker`).
**Engine refs (the checker's dependencies):**
[`../engine/systems/15-engine-api-and-scenarios.md`](../engine/systems/15-engine-api-and-scenarios.md)
(the `Engine` class: `new Engine(scenario)`, `inject`, `run`, `stats()`, `RunDescriptor`,
`replay`) · [`../engine/systems/13-statistics-and-observation.md`](../engine/systems/13-statistics-and-observation.md)
(`LiveStats`/`Histograms`/`ObservationFrame`/`RunDigest` — the numbers a goal reads) ·
[`../engine/systems/14-snapshot-and-reproducibility.md`](../engine/systems/14-snapshot-and-reproducibility.md)
(`RunDigest`, `replay`, INV-DET/INV-REPLAY — the determinism backbone the verdict rests on).
**GeneScript refs (hint tone reuse):**
[`../genescript/06-diagnostics-and-validation.md`](../genescript/06-diagnostics-and-validation.md)
(**C-GS-KID** §4 tone rules and the §5.2 replication-hint style this doc reuses verbatim for
goal failure hints).

**Contracts obeyed:** **C-CON-DET** (a goal check is a pure function of `(scenario, seed,
genome, goal)`; same inputs ⇒ same verdict — it runs the *real* engine and reads its
integer/digest surface, never a float on the fate path), **C-CON-KID** (every hint follows the
GeneScript DIAG tone), **C-CON-SUBSET** (a goal's predicate never needs a verb the lesson's
active subset hasn't unlocked — PROGRESS [05] enforces the graph; GOAL respects it),
**C-CON-COMPILES** (a goal is only checkable against a genome that compiles + loads),
**C-CON-DATA** (goals are declarative data, not executable authoring). Goal-checking is
**pure and read-only** — it builds a fresh engine, observes it, and returns a verdict; it never
mutates lesson content or shared state.

---

## 1. Purpose & responsibility

This system owns the **assessment layer** of the learning content package: how a lesson or
playground decides a learner **succeeded**. It owns four things. (1) The **Goal model** — a
declarative `{kind, params}` success condition (`replicates within N`, `reach population P`,
`shrink genome below S`, `survive N cycles`, `out-populate rival by cycle N`, `produce
diversity D`) with a tier (`required` vs `bonus`), a title, and a failure-hint template. (2) The
**deterministic checker** — a pure function that takes a goal + the playground's `(scenario,
seed, starter/submitted genome)`, runs it through `@tierra26/engine` for a bounded number of
cycles, and evaluates the goal's predicate against the engine's **observable outcomes**
(`stats()`/`RunDigest`/`ObservationFrame` — never editor heuristics), yielding a `GoalResult`
(pass/fail + measured value + hint on fail). (3) **Progress semantics** — meeting all
**required** goals of a lesson marks it complete, which feeds PROGRESS [05] to unlock the next
lesson/verbs; bonus goals are tracked separately and never block completion. (4) The **learner
progress record** — a pure-data map of which goals are met, computable and serializable, never
holding engine state. It also owns the **anti-cheese** guarantee (§6) and the **Versus reuse**
seam: a match win-condition *is* a goal evaluated over a shared scenario across two genomes. It
computes nothing by editor inspection and produces no bytes; it is a function of a goal plus a
deterministic engine run.

---

## 2. Interfaces

`goal.ts` exposes the model + a pure checker; it is consumed by the lesson runtime (completion),
the playground component [02] (inline pass/fail), PROGRESS [05] (unlock decisions), and the
Versus layer (win conditions). It imports the content types [01] (playground config) and
`@tierra26/engine` (the API surface [15]); it imports **no** DOM/host global (worker-portable,
mirrors API-006).

```ts
// ---- The declarative goal model ----

type Int = number;   // integer (C-INT-aligned; goal params & measured values are integers)

// The success-condition kinds. Each kind names a predicate over an engine run's observables.
type GoalKind =
  | 'replicates'      // creature produces >= `count` daughters within `within` cycles (births)
  | 'reach-pop'       // live population reaches >= `population` at/ before cycle `within`
  | 'shrink-genome'   // a live descendant genome size drops below `size` bytes
  | 'survive'         // the lineage stays alive (population > 0) for >= `cycles` cycles
  | 'out-populate'    // by cycle `by`, this genome's live pop > the rival's (Versus-ready)
  | 'diversity';      // distinct live genotypes reaches >= `count` by cycle `within`

interface GoalParams {
  within?: Int;       // cycle budget / deadline (replicates, reach-pop, diversity)
  count?: Int;        // #daughters (replicates) or #genotypes (diversity); default 1
  population?: Int;   // target live population (reach-pop)
  size?: Int;         // genome-size threshold in bytes, exclusive (shrink-genome)
  cycles?: Int;       // survival horizon (survive)
  by?: Int;           // decision cycle for a Versus comparison (out-populate)
}

type GoalTier = 'required' | 'bonus';   // required drives completion; bonus is stretch, never blocks

// A goal as authored in a lesson/playground (00 §3 `:::goal { kind, … }`).
interface Goal {
  id: string;                 // stable id, unique within the lesson (referenced by the record)
  kind: GoalKind;
  params: GoalParams;         // integer params for the kind (validated per-kind, §4.5)
  tier: GoalTier;             // default 'required'
  title: string;              // kid-facing one-liner: "Make your creature produce a baby."
  cycles?: Int;              // optional per-goal run budget override (else the playground's)
}

// ---- The checker's inputs & outputs ----

// Everything needed to build the deterministic run (mirrors the playground config, 00 §2/§3).
interface CheckContext {
  scenario: Scenario;          // engine Scenario (soupSize, active subset, seed, limits) [15]
  seed: Int;                   // convenience mirror of scenario.seed; the run is keyed on it
  genome: Uint8Array;          // the learner's (or starter's) compiled genome, opcode bytes
  maxCycles: Int;              // hard cap on cycles the checker will run (bounds the check)
  rivalGenome?: Uint8Array;    // present only for 'out-populate' / Versus (§4.6)
}

// A single kid-facing hint on failure — SAME shape/tone as GeneScript DIAG (06 §4).
interface GoalHint {
  code: string;                // stable, e.g. 'never-divided' | 'too-big' | 'died-early'
  message: string;             // plain language, ages 8-16 (C-CON-KID / C-GS-KID) — teaches
  suggestion?: string;         // the smallest concrete next step ("add `divide` when copy is done")
  hoverTerms?: string[];       // any technical word → resolvable to a wiki tooltip (KEYWORD [04])
  teaches: true;               // goal hints always teach, never scold (06 §4 rule 2)
}

interface GoalResult {
  goalId: string;
  kind: GoalKind;
  passed: boolean;
  measured: Int;               // the observed value the predicate compared (e.g. births, minSize,
                               //   final population, survived cycles, distinct genotypes)
  atCycle: Int;                // the cycle the verdict was decided at (deadline or first-satisfied)
  hint?: GoalHint;             // present iff !passed (C-CON-KID); absent on pass
}

// ---- The pure checker + progress ----

// Deterministic: same (goal, ctx) ⇒ same GoalResult (C-CON-DET / CONTINV-DET). Builds a fresh
// engine from ctx.scenario, injects the genome(s), runs to the budget, reads stats/digest.
function checkGoal(goal: Goal, ctx: CheckContext): GoalResult;

// Check every goal of a lesson; split by tier for the completion rule (§4.4).
interface LessonGoalOutcome {
  lessonId: string;
  results: GoalResult[];              // one per goal, in authored order (deterministic)
  requiredMet: boolean;              // ALL required goals passed → lesson complete
  bonusMet: number;                  // count of bonus goals passed (tracked, never blocks)
}
function checkLesson(lessonId: string, goals: Goal[], ctxOf: (g: Goal) => CheckContext): LessonGoalOutcome;

// ---- The learner progress record (pure data) ----

// Which goals a learner has met — serializable, no engine state, no floats.
interface GoalRecord {
  metGoalIds: readonly string[];     // stable-sorted set of passed goal ids (across lessons)
  completedLessonIds: readonly string[]; // lessons whose required goals are all met
}
function recordOutcome(prev: GoalRecord, outcome: LessonGoalOutcome): GoalRecord;  // pure merge
function isLessonComplete(rec: GoalRecord, lessonId: string): boolean;             // → PROGRESS [05]

// ---- Versus reuse (a win-condition is a goal over a shared scenario) ----

interface VersusResult { winner: 'a' | 'b' | 'tie'; a: GoalResult; b: GoalResult; }
// Ranks two genomes deterministically by an 'out-populate'/comparative goal over one scenario+seed.
function rankVersus(goal: Goal, scenario: Scenario, a: Uint8Array, b: Uint8Array): VersusResult;
```

- **Consumers.** The playground component [02] calls `checkGoal` when the learner runs their
  genome and renders `GoalResult.passed` + `hint`. The lesson runtime calls `checkLesson` and
  hands `requiredMet` to PROGRESS [05] via `isLessonComplete`. The Versus layer calls
  `rankVersus`. All are synchronous, pure, worker-portable.
- **Ownership.** GOAL owns the model, checker, and record shapes; it owns **no** engine or
  content state. It reads the frozen `Scenario`/genome from the playground config [01] and the
  read-only stats/digest from the engine [13]/[15]. The `GoalRecord` is the only "state", and it
  is pure immutable data the host persists.

---

## 3. Data structures

| Structure | Fields | Why / units | Invariant it holds |
|---|---|---|---|
| `Goal` | `id, kind, params, tier, title, cycles?` | the authored success condition (00 §3) | `id` unique per lesson; `params` valid for `kind` (§4.5); `tier` defaults `required` |
| `GoalParams` | `within/count/population/size/cycles/by` (all `Int`) | integer thresholds & deadlines | every value an **integer** ≥ its documented floor (no floats — C-CON-DET) |
| `CheckContext` | `scenario, seed, genome, maxCycles, rivalGenome?` | the full recipe for a deterministic run | `genome` compiles+loads (C-CON-COMPILES); `seed == scenario.seed`; `rivalGenome` present **iff** kind is comparative |
| `GoalResult` | `goalId, kind, passed, measured, atCycle, hint?` | the verdict + the number that decided it | `hint` present **iff** `!passed`; `measured`/`atCycle` integers; deterministic per input |
| `GoalHint` | `code, message, suggestion?, hoverTerms?, teaches:true` | kid-facing teaching hint (reuses DIAG shape) | `teaches` always true; jargon only via `hoverTerms` (C-CON-KID) |
| `LessonGoalOutcome` | `lessonId, results[], requiredMet, bonusMet` | per-lesson roll-up | `requiredMet == results.filter(required).every(passed)`; `results` in authored order |
| `GoalRecord` | `metGoalIds[], completedLessonIds[]` | the learner's pure-data progress | sets are stable-sorted, dedup'd; no engine state, no floats (serializable) |

- **Why integers only.** Every goal param and every `measured` value reads from the engine's
  **integer** surface (`stats().population/births/deaths`, `RunDigest`, genome byte length, live
  genotype count). `fullness` is the engine's one presentation float and a goal **never**
  branches on it (it would break C-CON-DET across JS engines); a fill target is expressed as
  `reach-pop`, not a fullness fraction. This keeps a verdict bit-stable across machines (§6).
- **Why a `measured` value on every result.** The playground shows "you got **7** babies, you
  needed **1**" — a concrete number the failure hint can reference (C-CON-KID rule 3). It is the
  same integer the predicate compared, so the UI never re-derives it.
- **Why the record is pure data.** `GoalRecord` is a fixed point of `recordOutcome` and holds
  only stable-sorted id sets — so it round-trips through serialization, drives PROGRESS [05]
  without coupling to the engine, and two learners' records merge deterministically. It is
  history (which goals ever passed), not a snapshot of a running engine.

---

## 4. Behavior / algorithms

### 4.1 The checker skeleton (deterministic engine run)

`checkGoal` never inspects the genome's source or the editor; it **runs the real engine** and
reads observable outcomes. This is the anti-cheese property (§6) and the C-CON-DET backbone.

```
checkGoal(goal, ctx):
  assertParamsValid(goal.kind, goal.params)        # §4.5 — integers, per-kind floors
  e = new Engine(ctx.scenario)                     # fresh engine [15]; seed = scenario.seed
  budget = goal.cycles ?? deadlineOf(goal) ?? ctx.maxCycles   # bounded run (never unbounded)
  e.inject(ctx.genome)                             # place at first free gap, register genotype
  if goal.kind == 'out-populate': e.inject(ctx.rivalGenome)   # §4.6
  return evaluate(goal, e, budget)                 # kind-specific predicate over the run (§4.2)
```

- The run is **bounded** by `budget = min(deadline, maxCycles)`; an unbounded goal is a
  validation error (§4.5). A goal that is satisfiable early is decided the moment the predicate
  first holds (`atCycle` = that cycle), so the checker can stop early — but the *verdict* is
  identical whether it stops early or runs to `budget` (determinism does not depend on the
  stopping rule; the engine trajectory is fixed by the seed).
- The checker samples via `stats()`/`digest()` on **whole-slice** boundaries (`run` is
  whole-slice per API-004); a "within N cycles" deadline is checked at the first sample whose
  `cycles >= N`. Sampling cadence never changes the verdict (it reads a monotone counter), only
  when it is *observed* — pinned so two implementations agree (§6, GOAL-002).

### 4.2 The per-kind predicates (all over engine observables)

```
evaluate(goal, e, budget):
  switch goal.kind:

  'replicates':                                   # births >= count within `within`
     need = goal.params.count ?? 1
     run e until stats().births >= need OR cycles >= min(within, budget)
     measured = stats().births
     pass = measured >= need
     hint-on-fail: pickReplicationHint(e)         # §4.3 — why it didn't breed

  'reach-pop':                                     # live population reaches target by deadline
     need = goal.params.population
     run e until stats().population >= need OR cycles >= min(within, budget)
     measured = maxPopulationSeen              # tracked as an integer high-water mark
     pass = measured >= need
     hint-on-fail: 'not-enough-babies' / 'died-out'

  'shrink-genome':                                 # a live descendant is smaller than `size`
     run e for budget cycles, tracking minLiveGenomeSize (from the size histogram [13])
     measured = minLiveGenomeSize
     pass = measured < goal.params.size
     hint-on-fail: 'too-big' (name the current smallest size vs the target)

  'survive':                                        # population > 0 for the whole horizon
     run e for goal.params.cycles cycles, watching for population == 0
     measured = cyclesSurvived                     # cycle at which pop hit 0, else the horizon
     pass = measured >= goal.params.cycles
     hint-on-fail: 'died-early' (name the cycle it died)

  'diversity':                                      # distinct live genotypes reaches target
     need = goal.params.count
     run e until stats().genotypes >= need OR cycles >= min(within, budget)
     measured = maxGenotypesSeen
     pass = measured >= need
     hint-on-fail: 'no-variety' (mutation off? only one genotype ever seen)

  'out-populate':                                   # Versus — see §4.6

  return { goalId, kind, passed:pass, measured, atCycle, hint: pass ? undefined : hint }
```

- Every predicate compares **integers** the engine already maintains (`births`, `population`,
  `genotypes`, genome size). No predicate reads `fullness` or any float (C-CON-DET). High-water
  marks (`maxPopulationSeen`, `maxGenotypesSeen`, `minLiveGenomeSize`) are integer accumulators
  updated at each sample so a transient peak counts even if the population later dips.

### 4.3 Failure hints (kid-friendly, teaching — reuse GeneScript DIAG tone)

On failure, `checkGoal` produces a `GoalHint` that obeys the GeneScript **C-GS-KID** tone rules
(06 §4): short, encouraging, concrete, second-person, `teaches: true`, jargon only via
`hoverTerms`. Crucially the hint is chosen from the **engine run's observables**, not the
source — so it describes *what actually happened*, the anti-cheese property applied to teaching.

```
pickReplicationHint(e):                            # goal 'replicates' failed
  if e.stats().deaths > 0 and e.stats().births == 0 and creatureDied:
     return died-before-breeding
  if never executed a divide (no births, creature still alive):
     return 'never-divided'                        # the flagship example from the prompt
  if a daughter was allocated but the divide never reached the 0.7 gate:
     return 'copy-unfinished'
  ...
```

| Goal (kind) failed | `code` | Hint message shape (C-CON-KID) |
|---|---|---|
| `replicates` — no births, creature alive | `never-divided` | *"Your creature is alive, but it never made a baby — it never called **divide**. Add **divide** once the copy is finished!"* (hover: *divide*) |
| `replicates` — daughter unfinished | `copy-unfinished` | *"You started making a baby but the copy never finished, so **divide** didn't happen. Make sure your copy loop copies the whole creature."* |
| `replicates` — died first | `died-before-breeding` | *"Your creature died before it could make a baby. Try to reproduce sooner, before it runs out of room."* |
| `reach-pop` — short | `not-enough-babies` | *"You reached **{measured}** creatures but needed **{need}**. Can your babies make babies too?"* |
| `shrink-genome` — too big | `too-big` | *"Your smallest creature is **{measured}** bytes — the goal wants under **{size}**. Try removing steps it doesn't need."* |
| `survive` — died early | `died-early` | *"Your creatures lasted **{measured}** cycles but needed **{cycles}**. Something is killing them early — check they don't run off the end."* |
| `diversity` — too uniform | `no-variety` | *"Only **{measured}** kind(s) of creature appeared. Diversity needs mutation turned on and creatures that survive long enough to change."* |
| `out-populate` — lost | `out-numbered` | *"The rival ended with more creatures. Make yours copy faster or make smaller babies so more fit in the soup."* |

- **Reuse, don't reinvent.** The `replicates`/`copy-unfinished`/`never-divided` hints deliberately
  echo GeneScript DIAG §5.2 (`wont-reproduce`, `no-copy-loop`) — but sourced from the **run**, not
  the AST. DIAG catches the omission *before* running; GOAL confirms it *from the outcome*. The
  wording style is shared so the learner sees one consistent voice (C-CON-KID defers to C-GS-KID).
- `{measured}`/`{need}`/`{size}` are filled from the `GoalResult` integers, so every hint names a
  concrete number (rule 3). Templates are static strings with integer interpolation — no float, no
  RNG — so the same failing run yields a byte-identical hint (GOAL-004).

### 4.4 Pass/fail → completion → PROGRESS unlock

```
checkLesson(lessonId, goals, ctxOf):
  results = goals.map(g => checkGoal(g, ctxOf(g)))          # authored order (deterministic)
  required = results where goal.tier == 'required'
  requiredMet = required.every(r => r.passed)              # ALL required → complete
  bonusMet = count(results where tier=='bonus' and passed) # tracked, never blocks completion
  return { lessonId, results, requiredMet, bonusMet }
```

- **Completion rule:** a lesson is **complete** iff **all** its `required` goals pass. Bonus
  goals are counted for a "stretch" badge but a lesson with unmet bonus goals is still complete —
  they never gate progression (GOAL-005/GOAL-006).
- **Unlock hand-off:** `isLessonComplete(rec, lessonId)` is the boolean PROGRESS [05] reads to
  unlock the next lesson/verbs/subset. GOAL decides *met*; PROGRESS owns the *graph* of what that
  unlocks. The two never duplicate: GOAL emits a boolean per lesson, PROGRESS consumes it
  (C-CON-SUBSET: a goal never needs a verb the lesson hasn't introduced, so passing it can only
  unlock forward, never require something ungated — CONTINV-INTRO-BEFORE-USE).

### 4.5 Validation (reject impossible goals)

`assertParamsValid(kind, params)` throws a typed `GoalError` (never silently clamps) on:

- a param required by the kind is missing or non-integer (`replicates` needs a `within`;
  `reach-pop` needs `population`; `shrink-genome` needs `size`; `survive` needs `cycles`;
  `diversity` needs `count`; `out-populate` needs `by`).
- a deadline/threshold ≤ 0 (a goal must be satisfiable and bounded — no unbounded run, §4.1).
- `count`/`population`/`size`/`by` below their floor (`count ≥ 1`; `size ≥ minCellSize` is
  unreachable → warn/reject; `population ≥ 1`).
- `out-populate` used without a `rivalGenome` in the `CheckContext` (a comparative goal needs two
  genomes — §4.6).
- (soft, cross-layer) a `diversity` goal in a scenario with `mutation == 0` can never exceed 1
  genotype under breed-true (API-005) — flagged so authors don't ship an unwinnable required goal.

### 4.6 Versus win-conditions (a goal over a shared scenario)

```
rankVersus(goal, scenario, a, b):                          # goal.kind == 'out-populate'
  # ONE shared soup, both genomes injected, run to goal.params.by, compare live populations.
  e = new Engine(scenario)
  idA = e.inject(a); idB = e.inject(b)                      # both into the same soup [15]
  run e to cycle goal.params.by
  popA = livePopulationOfLineage(e, idA)                    # descendants of a (by genotype/lineage)
  popB = livePopulationOfLineage(e, idB)
  ra = { ...result for a, measured: popA, passed: popA > popB }
  rb = { ...result for b, measured: popB, passed: popB > popA }
  winner = popA > popB ? 'a' : popB > popA ? 'b' : 'tie'
  return { winner, a: ra, b: rb }
```

- **Same scenario + seed ⇒ same ranking** (GOAL-008). Both genomes share one deterministic soup;
  the outcome is a pure function of `(scenario, a, b)` because the engine is deterministic
  (INV-DET) and the comparison is an integer `>`. Swapping the injection order is *not* symmetric
  in general (soup placement differs), so `rankVersus` fixes a canonical order (a then b) and the
  ranking is stable for that order — the same property a real match needs.
- This is why the model has an `out-populate` kind and `CheckContext.rivalGenome`: a Versus match
  outcome is **just a goal evaluated over a shared scenario**, so lessons that teach "beat this
  rival" and the future Versus mode share one checker. A tie is a first-class outcome.

---

## 5. Interconnections

- **Calls down:** `@tierra26/engine` [15] — `new Engine(scenario)`, `inject`, `run`, `step`,
  `stats()`, and (for stability) `digest()`; the stats/observation surface [13]
  (`population/births/genotypes`, size histogram for `minLiveGenomeSize`). It reads only; it
  never mutates the engine beyond driving its own private instance.
- **Called by:** the playground component [02] (renders `GoalResult.passed` + `hint` inline after
  a learner run); the lesson runtime (`checkLesson` → completion); PROGRESS [05] (reads
  `isLessonComplete` to unlock); the Versus layer (`rankVersus`). The content parser [01]
  validates the authored `:::goal` directive into a `Goal` (params-per-kind), so a malformed goal
  is a *content* error caught at authoring, not at check time.
- **Reuses:** GeneScript DIAG [genescript/06] tone (C-GS-KID) for every `GoalHint`; the KEYWORD
  registry [04] resolves each `hoverTerm`. The playground config [02]/[01] supplies the
  `Scenario` + starter genome that become the `CheckContext`.
- **Contracts crossed:** **C-CON-DET** (the checker is a deterministic engine run; feeds
  CONTINV-DET), **C-CON-KID** (hints defer to C-GS-KID), **C-CON-SUBSET** (a goal respects the
  lesson's active subset — PROGRESS enforces, GOAL never asks for an ungated verb; feeds
  CONTINV-INTRO-BEFORE-USE), **C-CON-COMPILES** (only checkable against a compiling genome).

---

## 6. Determinism & edge cases

- **Determinism (C-CON-DET / CONTINV-DET).** `checkGoal(goal, ctx)` is a pure function of its
  inputs: it builds a **fresh** engine from `ctx.scenario` (seed included), injects fixed
  genomes, and reads integer counters / the `RunDigest`. No `Math.random`, no `Date.now`, no
  float on the fate path, no Map-order iteration. Two calls with the same inputs — on any machine,
  in any process — return an **identical** `GoalResult` (same `passed`, `measured`, `atCycle`,
  `hint`). This rests directly on the engine's INV-DET/INV-REPLAY. **(GOAL-002.)**
- **Anti-cheese: outcomes, not editor heuristics.** A goal is *never* satisfied by inspecting the
  source, the AST, or an editor signal. The only way to pass is for the **real engine run** to
  exhibit the observable outcome (a birth actually happened, the population actually reached P).
  A genome that "looks like" it replicates but faults at the 0.7 gate fails `replicates`; a
  genome that genuinely breeds passes — the verdict tracks reality, not intent. **(GOAL-007.)**
- **Bounded runs.** Every check runs at most `min(deadline, maxCycles)` cycles; there is no
  unbounded goal (§4.5). A `survive` goal runs exactly its horizon. This makes checking cost
  predictable and keeps the checker from hanging on a pathological genome.
- **Sampling vs. deadline.** `run` advances by whole slices (API-004), so a "within N" deadline
  is evaluated at the first sample with `cycles >= N`; because the compared counter is monotone
  and the trajectory is seed-fixed, the pass/fail is independent of sample cadence — only
  `atCycle` reflects where it was *observed*, and the cadence is pinned so implementations agree.
- **Empty / instant-death genome.** An inert genome (never divides) fails `replicates` with
  `measured: 0` and the `never-divided` hint. A genome that faults immediately fails `survive`
  with `measured` = the cycle it died and `died-early`. Neither throws — a failing learner run is
  a normal, expected outcome, not an error.
- **Breed-true diversity.** With `mutation == 0` (M0/early lessons), `genotypes` stays 1
  (API-005), so a `diversity` goal with `count > 1` is unsatisfiable — flagged at validation
  (§4.5) so it never ships as a *required* goal in a mutation-off lesson.
- **Versus symmetry.** `rankVersus` fixes injection order (a then b); the ranking is deterministic
  for that order. A `tie` is returned when live populations are exactly equal at cycle `by` — a
  real, first-class outcome, not an error.
- **Record purity.** `recordOutcome` is a pure merge into stable-sorted, dedup'd id sets;
  re-recording the same outcome is idempotent, and merging two records is order-independent — so
  the learner's progress is deterministic and serializable, with no engine state leaking in.
- **No faults, no floats in the verdict.** GOAL never `raiseE`s (that's an engine concern) and
  never emits a float in a `GoalResult`; a genome fault is *observed* (via deaths/population), not
  propagated. `measured` and `atCycle` are always integers.

---

## 7. Fidelity notes

Tierra has **no assessment layer** — it is a research simulator with no lessons, goals, or
learner model. Every construct here is a **tierra26 learning-layer addition** built *on top of*
the faithful engine, so the fidelity question is "does the check observe the real dynamics?" not
"does Tierra do this?".

| Aspect | Tag | Why |
|---|---|---|
| Declarative `{kind, params}` goal model | **[MOD]** | Content-as-data (C-CON-DATA): a goal is authored data, mirroring how `RunDescriptor` makes a run data. No analogue in Tierra. |
| Deterministic checker via the real engine | **[CORE]** | The verdict must observe the *real* simulation (SPEC "formidable underneath"): friendliness is UX, never a weakened sim. Reuses the engine's INV-DET/INV-REPLAY exactly — a goal check is a `RunDescriptor`-shaped computation. |
| Reading integer observables only (`births`/`population`/`genotypes`/size) | **[CORE]** | Same C-INT/C-DET wall the engine holds (13 §6): a float in the verdict would break cross-machine parity. Preserves the engine's determinism guarantee end-to-end. |
| Kid-friendly failure hints | **[MOD]** | Reuses GeneScript DIAG tone (C-GS-KID) rather than inventing a second voice; sourced from the run's outcome, not the AST. |
| Multi-tier goals (required/bonus) | **[MOD]** | A pedagogy construct (scaffolding + stretch), not a simulator feature. |
| Versus win-condition = a goal over a shared scenario | **[MOD]** | SPEC §Versus sits at the top of the arc; reusing the goal checker (one shared soup, integer population `>`) keeps match outcomes as deterministic and shareable as any run (a `RunDescriptor` with two injections). |
| Learner progress record | **[MOD]** | Pure-data progress feeds PROGRESS [05]; the engine is stateless w.r.t. who is learning. |

Fidelity stance: **[MOD] learning layer, [CORE] observation discipline.** The assessment is new,
but it earns its verdict only by running the unmodified engine and reading its integer/digest
surface — so a goal check is exactly as deterministic and reproducible as the engine itself, and
never a heuristic shortcut around the real simulation.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[GOAL-NNN] …')` in
[`../../../packages/content/test/06-goal.test.ts`](../../../packages/content/test/06-goal.test.ts).
IDs are append-only. Cross-layer determinism also appears as **CONTINV-DET** in
`packages/content/test/_invariants.test.ts` (00 §6).

- **GOAL-001** — **`replicates within N` passes for a breeder, fails for an inert creature:** a
  `{kind:'replicates', within:N, count:1}` goal returns `passed:true` (with `measured >= 1`
  births) for a genome that breeds within N cycles, and `passed:false` (`measured:0`) for an
  inert genome that never divides — the verdict comes from the engine's `births`, not the source.
- **GOAL-002** — **the checker is deterministic (C-CON-DET / CONTINV-DET):** two `checkGoal(goal,
  ctx)` calls with the **same** `(scenario, seed, genome, goal)` return **identical** `GoalResult`s
  (same `passed`, `measured`, `atCycle`, and `hint`), including across a fresh process — no
  `Math.random`/`Date.now`/float on the verdict path.
- **GOAL-003** — **`shrink-genome` reads genome size correctly:** a `{kind:'shrink-genome',
  size:S}` goal passes iff some live descendant's genome is **< S** bytes (read from the size
  histogram / live-creature sizes [13]), with `measured` = the smallest live genome size observed;
  a genome that never shrinks below S fails with the correct `measured`.
- **GOAL-004** — **failure yields a kid-friendly teaching hint (C-CON-KID / C-GS-KID):** a failed
  `replicates` goal for an alive-but-never-divided creature returns a `GoalHint` with
  `code:'never-divided'`, `teaches:true`, a short second-person message naming **`divide`**, any
  jargon declared in `hoverTerms`, and a concrete `suggestion`; the message is byte-identical for
  the same failing run.
- **GOAL-005** — **required vs bonus goals tracked separately:** `checkLesson` sets `requiredMet`
  from **only** the `required` goals and counts passed `bonus` goals in `bonusMet`; an unmet bonus
  goal does **not** clear `requiredMet`.
- **GOAL-006** — **meeting all required goals marks the lesson complete (→ PROGRESS unlock):**
  when every required goal passes, `requiredMet` is true and `recordOutcome` adds the lesson to
  `completedLessonIds` so `isLessonComplete(rec, lessonId)` is true (the boolean PROGRESS [05]
  reads to unlock); a single failed required goal leaves it incomplete.
- **GOAL-007** — **goals evaluate observable engine outcomes (anti-cheese):** a goal passes **only**
  when a real `@tierra26/engine` run exhibits the outcome — a genome that *appears* to replicate in
  source but faults before dividing fails `replicates`, and no editor/AST heuristic can satisfy a
  goal that the engine run does not.
- **GOAL-008** — **a Versus win-condition ranks two genomes deterministically:** `rankVersus(goal,
  scenario, a, b)` with `{kind:'out-populate', by:C}` injects both genomes into **one** shared
  soup, runs to cycle C, and returns a `winner` (`'a'|'b'|'tie'`) by integer live-population
  comparison; the same `(scenario, a, b)` yields the same `winner` on every run (INV-DET), and an
  exact tie returns `'tie'`.
- **GOAL-009** — **`reach-pop` uses an integer high-water mark:** a `{kind:'reach-pop',
  population:P, within:N}` goal passes iff the live population reaches **≥ P** at any sample by
  cycle N (`measured` = the max population seen), so a transient peak that later dips still passes;
  it reads `stats().population`, never `fullness`.
- **GOAL-010** — **`survive N` passes iff the lineage lives the whole horizon:** a
  `{kind:'survive', cycles:N}` goal passes iff `population > 0` for all N cycles (`measured` = N);
  a lineage that dies at cycle k < N fails with `measured:k` and a `died-early` hint.
- **GOAL-011** — **invalid/unsatisfiable goals are rejected at validation:** a goal missing a
  kind-required param, with a non-integer/≤0 deadline, or a **required** `diversity` goal in a
  `mutation==0` scenario (unwinnable under breed-true, API-005) is rejected by
  `assertParamsValid`/authoring validation (never silently clamped or shipped).
- **GOAL-012** — **the learner progress record is pure state:** `recordOutcome` merges outcomes
  into stable-sorted, dedup'd `metGoalIds`/`completedLessonIds`; re-recording the same outcome is
  idempotent and merging is order-independent, with no engine state or float in the record
  (serializable, deterministic).

---

## 9. Open questions

1. **`atCycle` sampling cadence lock-in.** The pass/fail is cadence-independent (monotone counter),
   but `atCycle` (where a satisfiable goal is *first observed* true) depends on the sample
   boundary. Fix a canonical cadence (e.g. sample after each whole slice) so `atCycle` is stable
   across implementations, or expose the deadline-exact value only? Propose: whole-slice sampling,
   pinned in the checker.
2. **Lineage attribution for Versus (`livePopulationOfLineage`).** Attribute a live creature to
   genome a vs b by genotype id of the injected ancestor, or by a tracked lineage/parent chain?
   Under mutation-off both agree (breed-true genotype); under mutation-on lineage tracking is
   needed. Confirm the genebank [12] exposes ancestor lineage, or restrict Versus to mutation-off
   for M3.
3. **`shrink-genome` — smallest *live* vs smallest *ever*.** Read the min from live creatures each
   sample (a creature that shrank then died wouldn't count), or track the min genome size ever
   observed in the run? Propose: smallest *live* (the learner must keep a small creature alive),
   with the alternative behind a param if a lesson wants "smallest ever".
4. **Bonus-goal budget.** Do bonus goals reuse the required goals' `CheckContext`/run, or may they
   specify a longer `maxCycles` (a stretch goal often needs more cycles)? Propose: per-goal
   `cycles` override (already in the model), sharing one engine instance per distinct budget to
   keep checking cheap.
5. **Partial-credit / progress within a goal.** Should a failed goal expose "how close" beyond
   `measured` (e.g. a 0–1000 scaled-integer progress for a UI bar), or is `measured` vs `need`
   enough? Propose: `measured`/`need` only for M3; add a scaled-integer progress if the UI needs a
   bar (kept integer per C-CON-DET).
6. **Multi-goal shared run.** When several goals of one lesson share the same `(scenario, seed,
   genome)`, run the engine once and evaluate all predicates over that single trajectory (cheaper,
   still deterministic), or keep one run per goal for isolation? Propose: shared run per distinct
   `CheckContext`, since the trajectory is identical — a pure optimization that cannot change any
   verdict.
