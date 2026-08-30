# Playground Component — Engineering Spec              (Code: PLAY · Milestone: M3)

**Status:** v1. Owns the **embeddable engine-instance contract**: the data + behavior a
`:::playground` becomes — the config that fully describes a run, the lifecycle/controls it
accepts, and the observation state it exposes to a host UI. It drives a **real**
`@tierra26/engine` instance ("formidable underneath" — [`00-overview.md`](00-overview.md)
§1); it is **not** the renderer. Visual rendering (registers lighting, cells coloring, the
IP moving) belongs to the UI layer, which *consumes* this contract rather than inventing it
([`00-overview.md`](00-overview.md) §8). PLAY is a **CONTRACT the UI implements**, not pixels.

**Upstream refs:**
[`00-overview.md`](00-overview.md) §2 (the pipeline: a `<Playground>` directive → config
`scenario+seed+starter genome+goal`), §3 (the `:::playground {scenario, seed, starter,
subset} … :::goal … :::` directive form), §5 contracts (esp. **C-CON-DET** playground runs
are deterministic; **C-CON-COMPILES** every starter/solution genome compiles under its active
subset and loads; also **C-CON-SUBSET**, **C-CON-KID**), §4 doc set (PLAY = 02; consumes [01]
CONTENT parse, [03] INSTRPAGE "try this" scenarios, [06] GOAL embedded goal) ·
[`../engine/systems/15-engine-api-and-scenarios.md`](../engine/systems/15-engine-api-and-scenarios.md)
(the `Engine` class: `Scenario`, `inject`, `step`, `run`, `stats`, `snapshot`/`restore`/
`replay`; `SubsetSpec`; `RunDescriptor`; whole-slice `run` vs exact `step`) ·
[`../engine/systems/13-statistics-and-observation.md`](../engine/systems/13-statistics-and-observation.md)
(the `ObservationFrame` the playground streams to the UI: `LiveStats`, `topGenotypes`,
`sizeHist`, `TankView`) ·
[`../genescript/00-overview.md`](../genescript/00-overview.md) §3 (compile GeneScript starter
→ engine bytes + source map; C-GS-DET, C-GS-VALID) ·
[`../engine/M0-TECH-DESIGN.md`](../engine/M0-TECH-DESIGN.md) §14 (`RunDescriptor`
`{engineVersion, scenario, injections, cycles}` — the shareable replay recipe PLAY mirrors).

**Contracts obeyed:** **C-CON-DET** (a `PlaygroundConfig` = scenario+seed+starter+subset ⇒ a
deterministic, shareable run, exactly like a `RunDescriptor` — the same config yields the same
`ObservationFrame` stream), **C-CON-COMPILES** (the starter/solution/variant genomes compile
under the active subset via `@tierra26/genescript` and load in `@tierra26/engine`), **C-CON-
SUBSET** (the config's active subset ⊆ verbs the lesson unlocks; an injected/edited genome
using a gated verb is refused, not silently loaded), **C-CON-DATA** (config is declarative,
serializable data — no executable authoring), **C-CON-KID** (any learner-facing label/message
routed through this contract obeys the age-8–16 tone rules). Transitively rests on the engine's
**C-DET**/**C-SNAP** and GeneScript's **C-GS-DET**/**C-GS-VALID**.

---

## 1. Purpose & responsibility

The Playground Component contract owns the **declarative description of an embedded engine
instance** and the **behavior** the host UI must be able to drive against it — while owning
**none** of the rendering. It owns: (a) the **`PlaygroundConfig`** — the tiny, serializable
record that fully determines a run (scenario id/ref, seed, starter genome in GeneScript, active
instruction subset, optional embedded goal [06], display/panel options, default speed,
spotlight/focus), and its normalization/validation; (b) the **lifecycle & controls contract**
— the set of operations a UI invokes (run/pause, step-one-instruction, reset-to-initial,
set-speed, "try this" variant switching, inject-edited-genome) and their exact semantics;
(c) the **exposed state contract** — what a running playground makes observable to the host
(the engine `ObservationFrame` stream [13], current cycle/stats, goal status [06], and the
**source-mapped genome** for peek-under-hood [GeneScript §3]); and (d) the **reproducibility
guarantee** — that a `PlaygroundConfig` is shareable and replay-equivalent to an engine
`RunDescriptor` (C-CON-DET). It does **not** own: canvas/DOM, animation timing curves, colors,
layout, or keyword tooltip rendering (UI layer); the simulation itself (it *drives* a real
`@tierra26/engine`, adding no simulation behavior); goal-checking logic (delegated to [06]);
compilation/disassembly (delegated to `@tierra26/genescript`). It is the **seam** between
authored content [01], the engine [15]/[13], GeneScript, goals [06], and the UI.

---

## 2. Interfaces

Defined in `packages/content/src/playground.ts` (data model + logic only — pure, testable,
no rendering). It imports the engine API surface (`Engine`, `Scenario`, `SubsetSpec`,
`ObservationFrame`, `Snapshot`, `RunDescriptor`), the GeneScript compiler
(`compile`/`disassemble` + source map), and the goal checker [06]. It is imported by the UI
layer (which renders it) and by [01] CONTENT (which produces a `PlaygroundConfig` from a
parsed `:::playground` directive). No engine or GeneScript module imports *this*.

```ts
// ---- The authored config (serializable data; the shareable recipe) ----

// Where the starter genome comes from: inline GeneScript, or a reference resolved by [01]/[03].
type GenomeSource =
  | { kind: 'genescript'; source: string }         // inline GeneScript text (compiled under subset)
  | { kind: 'ref'; id: string };                    // named starter/solution/scenario genome (resolved by [01]/[03])

// Which engine instructions this playground enables. Either the classic-32, or a named subset
// listing GeneScript verbs; resolved to an engine SubsetSpec (nop0/nop1 always implied, [15] §4.4).
type ActiveSubset =
  | { kind: 'classic32' }
  | { kind: 'subset'; name?: string; verbs: readonly string[] };  // GeneScript verb mnemonics

// A "try this" alternative starter the learner can swap to (per-instruction "editable
// scenarios" [03] and in-lesson experiments). Each variant is itself a deterministic starter.
interface PlaygroundVariant {
  readonly id: string;                    // stable id (used for share links + selection)
  readonly label: string;                 // kid-facing name (C-CON-KID)
  readonly starter: GenomeSource;         // the alternative starting genome
}

// Optional, purely-presentational hints. The UI MAY honor them; they never affect the run.
interface DisplayOptions {
  readonly panels?: readonly PanelId[];   // which panels to show, e.g. ['soup','registers','code','stats']
  readonly speedDefault?: SpeedLevel;     // initial play speed (a level, not wall-clock — see §3)
  readonly spotlight?: SpotlightSpec;     // focus/highlight, e.g. a specific instruction/verb or code line
}
type PanelId = 'soup' | 'registers' | 'stack' | 'code' | 'stats' | 'goal' | 'tank';
type SpeedLevel = 'step' | 'slow' | 'normal' | 'fast' | 'max';  // maps to a UI cadence, not sim state
interface SpotlightSpec {
  readonly instruction?: string;          // highlight a specific verb/instruction (per-instruction pages [03])
  readonly line?: number;                 // highlight a starter source line (via the source map)
}

interface PlaygroundConfig {
  readonly scenario: string | Partial<Scenario>;    // scenario id (resolved by [01]) or an inline partial
  readonly seed: number;                             // uint32 PRNG seed (C-CON-DET); part of the recipe
  readonly starter: GenomeSource;                    // the initial creature, authored in GeneScript
  readonly subset: ActiveSubset;                     // active instruction subset (C-CON-SUBSET)
  readonly goal?: GoalSpec;                           // optional embedded goal [06]
  readonly variants?: readonly PlaygroundVariant[];  // optional "try this" alternatives
  readonly display?: DisplayOptions;                 // optional presentation hints (never affect the run)
  readonly cyclesHint?: number;                       // optional default budget for a "run to end" control
}

// ---- What the host UI drives: the controls contract ----
// PLAY specifies these operations & their semantics; the UI supplies the timer/renderer.

interface PlaygroundControls {
  play(): void;                    // begin/continue auto-advancing at the current speed level
  pause(): void;                   // stop auto-advancing; state frozen, resumable
  stepInstruction(): void;         // advance EXACTLY one instruction (engine.step, [15] §4.3)
  reset(): void;                   // return to the EXACT initial state (cycle 0, fresh inject) — C-CON-DET
  setSpeed(level: SpeedLevel): void;   // change the auto-advance cadence (presentation only)
  selectVariant(variantId: string): void;  // swap the starter to a "try this" variant; implies reset
  injectEdited(source: string): InjectResult;  // compile learner-edited GeneScript & load it (C-CON-COMPILES)
  runTo(cycle: number): void;      // advance to (about) a cycle via whole-slice engine.run ([15] §4.3)
}

// ---- What a running playground EXPOSES to the host (read-only observation) ----

interface PlaygroundState {
  readonly config: Readonly<PlaygroundConfig>;   // the (normalized) config driving this instance
  readonly status: 'idle' | 'running' | 'paused' | 'ended';
  readonly cycle: number;                        // engine.cycles (the global clock)
  readonly frame: Readonly<ObservationFrame>;    // the engine observation frame [13] (stats, tank, histograms)
  readonly goal?: Readonly<GoalStatus>;          // goal pass/fail/progress [06], if a goal is embedded
  readonly genome: Readonly<SourceMappedGenome>; // current starter/loaded genome + source map (peek-under-hood)
  readonly activeVariantId?: string;             // which variant is loaded, if any
}

// The source-mapped genome the "peek under the hood" view renders (GeneScript §3 source map).
interface SourceMappedGenome {
  readonly source: string;                       // GeneScript text (authored or disassembled)
  readonly bytes: Uint8Array;                    // compiled opcode bytes loaded into the engine
  readonly map: readonly SourceMapEntry[];       // line ↔ byte-range mapping (GSINV-SOURCEMAP)
}
interface SourceMapEntry { readonly line: number; readonly byteStart: number; readonly byteEnd: number; }

// Result of a learner injecting edited code — success loads it; failure yields kid-friendly diagnostics.
type InjectResult =
  | { ok: true; creatureId: number; genome: SourceMappedGenome }
  | { ok: false; diagnostics: readonly Diagnostic[] };   // compile/subset errors (C-GS-KID / C-CON-KID)

// ---- Config ⇄ engine bridge (the reproducibility guarantee) ----

// Normalize/validate an authored config: resolve refs, resolve the subset to an engine SubsetSpec,
// compile the starter under that subset, fill display defaults, validate against C-CON-SUBSET. Throws
// a typed error (or returns diagnostics) if the starter fails to compile/load (C-CON-COMPILES).
function normalizePlayground(cfg: PlaygroundConfig): NormalizedPlayground;

// A PlaygroundConfig is replay-equivalent to an engine RunDescriptor: the SAME config produces the
// SAME ObservationFrame stream (C-CON-DET). This is the shareable-recipe bridge.
function toRunDescriptor(cfg: NormalizedPlayground): RunDescriptor;   // {engineVersion, scenario, injections:[{atCycle:0, genome}], cycles}
function serializeConfig(cfg: PlaygroundConfig): string;              // stable, shareable (share link / embed)
function deserializeConfig(s: string): PlaygroundConfig;              // inverse; round-trips
```

- **Data vs behavior split.** `PlaygroundConfig` + `PlaygroundState` + the bridge functions are
  the **data** contract (owned here, fully testable). `PlaygroundControls` is the **behavior**
  contract: PLAY specifies *what each control does to the underlying engine*; the UI supplies the
  timer that calls `stepInstruction`/`runTo` and the renderer that reads `PlaygroundState`.
- **It drives a real engine.** Every control maps to a real `@tierra26/engine` operation:
  `stepInstruction → engine.step`, `runTo → engine.run`, `reset → new engine + inject(starter)`,
  `injectEdited → compile + engine.inject` ([15] §4.2/§4.3). No behavior is faked.
- **Speed is presentation.** `SpeedLevel` maps to a UI auto-advance cadence (how often the timer
  calls `stepInstruction`/`runTo`), never to engine state — so two speeds yield the **same**
  frames at the same cycle (C-CON-DET; mirrors [13] §4.4 observation-cadence independence).

---

## 3. Data structures

The component holds a normalized config, a single owned `Engine`, and read-only exposed state.

| Field | Type | Units / domain | Why |
|---|---|---|---|
| `config.seed` | int | `[0, 2^32)` | PRNG seed; part of the deterministic recipe (C-CON-DET) |
| `config.scenario` | id \| `Partial<Scenario>` | resolved to a normalized `Scenario` [15] | the engine world the playground builds |
| `config.starter` | `GenomeSource` | GeneScript text or a resolvable ref | the initial creature; compiled under `subset` (C-CON-COMPILES) |
| `config.subset` | `ActiveSubset` | classic-32 or verb list → engine `SubsetSpec` | which instructions are enabled (C-CON-SUBSET) |
| `config.goal` | `GoalSpec?` | [06] goal schema | optional embedded success condition |
| `config.variants` | `PlaygroundVariant[]?` | each an alternative starter | "try this" swaps (from [03] editable scenarios) |
| `config.display` | `DisplayOptions?` | presentation-only | panels/speed/spotlight hints — never affect the run |
| `state.cycle` | int | `engine.cycles` | the global instruction clock exposed to the UI |
| `state.frame` | `ObservationFrame` | frozen, read-only [13] | the stats/tank/histogram stream the UI renders |
| `state.goal` | `GoalStatus?` | [06] | queryable pass/fail/progress at the current cycle |
| `state.genome` | `SourceMappedGenome` | bytes + line↔byte map | peek-under-hood; the source map is GeneScript's (GSINV-SOURCEMAP) |

Invariants:
- **PLAY-CFG-SERIALIZABLE:** a `PlaygroundConfig` is pure JSON-serializable data (no functions,
  no engine handles); `deserializeConfig(serializeConfig(cfg))` deep-equals `cfg`. This is what
  makes a playground **shareable** and embeddable in content [01] (C-CON-DATA).
- **PLAY-CFG-DETERMINES-RUN:** `{scenario, seed, starter, subset}` **fully** determines the
  emitted `ObservationFrame` stream. Two components built from the same config emit
  byte-identical frames at every cycle (C-CON-DET) — `display`/`speed`/`spotlight` are excluded
  from the recipe and never perturb it.
- **PLAY-CFG-COMPILES:** after `normalizePlayground`, the starter (and every variant, and any
  embedded solution) has compiled under the active subset and loads in the engine without an
  illegal-opcode error (C-CON-COMPILES / C-GS-VALID). Normalization fails loudly otherwise.
- **PLAY-SUBSET-CLOSED:** the active subset ⊆ the verbs the lesson unlocks (C-CON-SUBSET, checked
  against [05]); an `injectEdited`/variant genome using a verb outside the subset is refused with
  a diagnostic, never loaded.
- **PLAY-STATE-READONLY:** everything in `PlaygroundState` is read-only/frozen (the exposed
  `ObservationFrame` is already frozen by [13] STAT-007); the UI cannot write back into engine
  state through the exposed surface.
- **PLAY-SINGLE-ENGINE:** the component owns exactly one `Engine`; `reset`/`selectVariant`
  rebuild it deterministically (fresh world + inject) rather than mutating a shared one — so two
  playgrounds on one page are fully independent (rests on engine C-SNAP / API-010).

---

## 4. Behavior / algorithms

### 4.1 Build from config (normalize → compile → construct)

```
normalizePlayground(cfg):
    scenario = resolveScenario(cfg.scenario)          # id → registered Scenario, or inline partial ([01]/[15])
    subsetSpec = resolveSubset(cfg.subset)            # verbs → engine SubsetSpec; nop0/nop1 implied ([15] §4.4)
    assertSubsetUnlocked(subsetSpec, cfg)             # C-CON-SUBSET: subset ⊆ unlocked verbs ([05])
    starterBytes, starterMap = compile(resolveGenome(cfg.starter), subsetSpec)   # C-GS-DET; throws→diagnostics
    for v in cfg.variants: compile(resolveGenome(v.starter), subsetSpec)          # C-CON-COMPILES for every variant
    display = fillDisplayDefaults(cfg.display)         # speedDefault='normal', panels = scenario default set
    return { scenario, subsetSpec, seed: cfg.seed, starter:{bytes,map}, goal: cfg.goal, variants, display, cyclesHint }
```

```
build(normalized):                                    # (re)construct the live instance — used by reset too
    engine = new Engine({ ...normalized.scenario, instructionSet: normalized.subsetSpec, seed: normalized.seed })
    creatureId = engine.inject(normalized.starter.bytes)   # [15] §4.2 — place at first free gap, register
    goalChecker = normalized.goal ? makeChecker(normalized.goal) : null   # [06]
    status = 'paused'; cycle = 0
```

The **initial state** is exactly: a fresh `Engine(scenario, subset, seed)` with the starter
injected at cycle 0 — deterministic and identical every build (C-CON-DET, PLAY-CFG-DETERMINES-RUN).

### 4.2 The controls (each maps to a real engine op)

```
stepInstruction():  engine.step(); cycle = engine.cycles; refreshFrame(); refreshGoal()   # exactly +1 ([15])
runTo(target):      engine.run(target - engine.cycles); cycle = engine.cycles; refresh*()  # whole-slice budget
play(level):        status='running'; the HOST timer calls stepInstruction/runTo at the level's cadence
pause():            status='paused'  (no engine call; state frozen, resumable)
setSpeed(level):    display.speed = level  (presentation only — does NOT touch the engine)
reset():            build(normalized)  # discard engine, rebuild from the SAME normalized config → cycle 0
selectVariant(id):  normalized.starter = compiled(variant[id]); build(normalized)  # swap + reset, deterministic
injectEdited(src):  {bytes,map,diags} = compile(src, subsetSpec)
                      if diags.errors: return {ok:false, diagnostics}      # C-GS-KID, subset-gated (C-CON-SUBSET)
                      id = engine.inject(bytes); refresh*(); return {ok:true, creatureId:id, genome:{...}}
```

- **`stepInstruction` advances exactly one instruction** — it calls `engine.step` (the exact
  single-instruction clock, [15] §4.3), so `cycle` increases by exactly 1 (PLAY-004).
- **`reset` returns to the EXACT initial state** — a fresh engine + fresh inject from the same
  normalized config, so `cycle == 0` and the post-reset frame equals the cycle-0 frame of a
  brand-new build (PLAY-003, C-CON-DET). It never tries to "rewind" a mutated engine.
- **`selectVariant` swaps the starter deterministically** — recompiles the chosen variant under
  the same subset and rebuilds; the same variant id always yields the same run (PLAY-006).
- **`injectEdited` compiles the learner's edit under the subset** — on success it loads into the
  running engine ([15] `inject`); on failure it returns kid-friendly diagnostics and loads
  nothing (C-CON-COMPILES / C-GS-VALID; verbs outside the subset are rejected, C-CON-SUBSET).
- **Speed never affects the run** — `play`/`setSpeed` only change how often the host timer
  advances the engine; the frames at a given cycle are identical regardless of speed (C-CON-DET).

### 4.3 Exposed state & the observation stream

```
refreshFrame():  state.frame = engine.observe(topK, tank)    # the frozen ObservationFrame [13] (§4.5)
refreshGoal():   state.goal  = goalChecker ? goalChecker.evaluate(engine, cycle) : undefined   # [06], deterministic
state.cycle   = engine.cycles
state.genome  = { source, bytes, map }   # authored starter, or disassemble(current bytes) for peek-under-hood (GeneScript §5)
```

- The UI **subscribes** to `PlaygroundState`: after every control call the component refreshes
  `frame`/`goal`/`cycle`/`genome`, and the UI re-renders. The frame is the engine's
  `ObservationFrame` [13] (scalars from `LiveStats`, `topGenotypes`, `sizeHist`, the `TankView`)
  — the playground adds nothing to it, it just streams it (PLAY-005: the exposed frame reflects
  engine stats exactly).
- **Goal status is queryable at any cycle** — `state.goal` is the [06] checker's deterministic
  pass/fail/progress against the current engine state; because both the run and the checker are
  deterministic per seed (C-CON-DET), goal status is reproducible (PLAY-007).
- **Peek-under-hood** — `state.genome` carries the GeneScript source, the compiled bytes, and the
  line↔byte source map (GSINV-SOURCEMAP), so the UI can highlight the executing instruction
  against the source line (`spotlight.line`/`spotlight.instruction`). For an *evolved/edited*
  genome with no authored source, `source` is the disassembly (GeneScript §5, best-effort).

### 4.4 Reproducibility = a RunDescriptor (C-CON-DET)

```
toRunDescriptor(normalized):
    return {
      engineVersion: Engine.version,
      scenario:      normalized.scenario-with-subset,          # the normalized, defaults-filled Scenario [15]
      injections:    [{ atCycle: 0, genome: normalized.starter.bytes }],   # the starter, injected at cycle 0
      cycles:        normalized.cyclesHint ?? goalWindow(cfg.goal),        # a default budget
    }
```

- A `PlaygroundConfig` is **isomorphic to a `RunDescriptor`** for the run it describes: resolve
  the scenario, compile the starter to the injected genome, and the seed + cycles complete the
  recipe. Therefore `Engine.replay(toRunDescriptor(cfg))` reproduces the playground's run
  bit-for-bit ([15] API-007 / INV-REPLAY) — the same config is **shareable** and yields the same
  frames (PLAY-001, PLAY-009). Display options are *not* part of the descriptor (they don't
  affect the run), which is why they are excluded from the deterministic recipe.
- A playground share link is therefore just `serializeConfig(cfg)` — a tiny record, not a
  recording (mirrors [15] §4.7: "a run is a tiny `RunDescriptor`, not a recording").

### 4.5 Embedding & reuse

- **In lessons [01]:** the `:::playground {scenario, seed, starter, subset} … :::goal …`
  directive ([`00-overview.md`](00-overview.md) §3) parses to a `PlaygroundConfig` with the goal
  attached; the lesson AST carries it, and the UI renders one inline playground per directive.
- **On per-instruction pages [03]:** the same component is reused for "editable scenarios" — the
  page supplies a starter spotlighting that instruction (`display.spotlight.instruction`) and one
  or more `variants` ("try this"), each a deterministic alternative starter. The learner uses
  `selectVariant`/`injectEdited` to experiment, all under the page's subset.

---

## 5. Interconnections

- **Imports (down only):** `@tierra26/engine` [15] (`Engine`, `Scenario`, `SubsetSpec`,
  `RunDescriptor`, `Snapshot`, and the `ObservationFrame`/`observe` surface [13]);
  `@tierra26/genescript` (`compile`/`disassemble` + source map, GeneScript §3/§5); the goal
  checker [06] (`makeChecker`/`GoalStatus`); the subset/unlock facts from progression [05]
  (C-CON-SUBSET) and starter/variant refs from [03]/[01].
- **Imported by:** the **UI layer** (renders `PlaygroundState`, drives `PlaygroundControls` with
  a timer) and **[01] CONTENT** (produces a `PlaygroundConfig` from a `:::playground` directive).
  No engine/GeneScript module imports this — it sits above them, below the UI.
- **Contracts crossed:** C-CON-DET (the config↔`RunDescriptor` isomorphism; same config → same
  frames — the primary guardian at the content layer, resting on engine C-DET / INV-REPLAY);
  C-CON-COMPILES (normalization compiles every genome under the subset and loads it, resting on
  C-GS-VALID); C-CON-SUBSET (subset ⊆ unlocked verbs; edited/variant genomes gated);
  C-CON-DATA (config is declarative, serializable); C-CON-KID (diagnostics/labels tone).
- **The rendering boundary:** this contract stops at `PlaygroundState` (data) and
  `PlaygroundControls` (behavior). Everything visual — canvas tank draw, register glow, IP
  cursor, animation timing, keyword tooltips — is the UI layer's, which consumes these types.

---

## 6. Determinism & edge cases

- **Same config ⇒ same frames (C-CON-DET).** Because a `PlaygroundConfig` reduces to a
  `RunDescriptor` and the engine is deterministic per seed, replaying/re-running a config yields
  identical `ObservationFrame`s at every cycle. `display`/`speed`/`spotlight`/`variants` are
  outside the recipe and cannot perturb it (PLAY-001, PLAY-008).
- **Speed independence.** A fast and a slow playground reach the same frame at the same cycle;
  speed only sets the host timer cadence (mirrors [13] §4.4 — observation cadence never changes
  the digest). Golden/goal checks are taken at explicit cycles, not on the UI cadence.
- **`runTo` overshoot.** `runTo(N)` uses whole-slice `engine.run`, so `cycle` after it lies in
  `[N, N + maxSliceSize)` ([15] API-004), **not** exactly `N`. `stepInstruction` is the exact
  single-instruction clock; use it when a precise cycle count matters (PLAY-004).
- **Reset is exact, not a rewind.** `reset` rebuilds a fresh engine and re-injects the starter,
  reaching the byte-identical initial state (cycle 0) — it does not attempt to undo mutations on
  a used engine (PLAY-003).
- **Edited genome that doesn't compile.** `injectEdited` returns `{ok:false, diagnostics}` and
  changes nothing; the running engine is untouched (C-CON-COMPILES; diagnostics are kid-friendly,
  C-GS-KID / C-CON-KID). A genome using a verb outside the active subset is refused (C-CON-SUBSET).
- **Inject into a full soup.** Delegates to engine `inject`, which throws on a soup too full to
  place the genome ([15] §6) — the component surfaces this as a diagnostic, never a silent reap.
- **Empty/ended population.** If the population reaches 0, `status` becomes `'ended'` and further
  `runTo`/`play` are no-ops ([15] §6 empty-population run); the last frame remains observable.
- **Goal before/after satisfaction.** `state.goal` is re-evaluated after each control; it is a
  pure, deterministic function of engine state at the current cycle ([06]) — never a wall-clock
  or float-driven check (C-CON-DET).
- **No hidden state / two playgrounds coexist.** The component owns one `Engine` and no
  module-level mutable state; two configs on one page run fully independently (rests on engine
  C-SNAP / API-010). `serializeConfig` output is stable across processes (PLAY-002).

---

## 7. Fidelity notes

- **[MOD] A content-layer contract over the faithful engine.** The Playground Component has **no
  analogue in Tierra** — the original is observed through bespoke UNIX tools (`10-tools-and-uis`).
  We expose a small, declarative config + a controls/state contract that *drives the real engine*
  ([15]) and *streams its real observation frame* ([13]). *Why:* "formidable underneath"
  ([`00-overview.md`](00-overview.md) §1) — friendliness is vocabulary, pacing, and UX, never a
  weakened simulation. This layer adds **zero** simulation behavior.
- **[CORE] Reproducibility inherited.** That a `PlaygroundConfig` is replay-equivalent to a
  `RunDescriptor` is the direct descendant of Tierra's seed-reproducibility (SPEC §12) — the
  property that makes a playground shareable and a lesson replayable. Non-negotiable (C-CON-DET).
- **[MOD] Subsets for progressive disclosure.** Reusing the engine's named-subset mechanism
  ([15] §4.4) to gate which verbs a playground enables is the tutorial mechanism (SPEC §9.2/§17-2)
  with zero engine change. *Why:* design→emergence progression ([`00-overview.md`](00-overview.md)
  §1) needs per-lesson vocabularies.
- **[MOD] Two-way "peek under the hood".** Exposing the source-mapped genome (and disassembling
  evolved/edited genomes) is GeneScript's two-way surface (GeneScript §3/§5) made observable to
  the UI. *Why:* studying evolved creatures is a headline learning goal (SPEC §10).
- **[OPTIONAL] Rendering, timing, keyword tooltips.** All pixels, animation curves, and tooltip
  content are the **UI layer's**, deferred here by design — PLAY is a contract, not a renderer.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[PLAY-NNN] …')` in
[`packages/content/test/02-play.test.ts`](../../../packages/content/test/02-play.test.ts).
IDs are append-only.

- **PLAY-001** — **config fully determines the run (C-CON-DET):** two playgrounds built from the
  *same* `PlaygroundConfig` (`{scenario, seed, starter, subset}`) emit **byte-identical**
  `ObservationFrame` streams at every cycle; equivalently `Engine.replay(toRunDescriptor(cfg))`
  reproduces the playground's run bit-for-bit (INV-REPLAY).
- **PLAY-002** — **config is serializable & shareable:** `deserializeConfig(serializeConfig(cfg))`
  deep-equals `cfg`, the serialized form is pure data (no functions/handles), and two independent
  processes deserializing the same string produce identical runs (C-CON-DATA + C-CON-DET).
- **PLAY-003** — **reset returns to the EXACT initial state:** after any sequence of
  `stepInstruction`/`runTo`/`injectEdited`, `reset()` yields `cycle == 0` and a frame
  byte-identical to a brand-new build from the same config (not a rewind of a used engine).
- **PLAY-004** — **step advances exactly one instruction:** `stepInstruction()` increases `cycle`
  by exactly 1 (delegates to `engine.step`, [15] §4.3), whereas `runTo(N)` (whole-slice
  `engine.run`) leaves `cycle` in `[N, N + maxSliceSize)`.
- **PLAY-005** — **exposed frame reflects engine stats:** `state.frame` equals the engine's
  `observe()`/`stats()` output at the current cycle (population, births, deaths, genotypes,
  fullness, tank) — the playground streams the [13] `ObservationFrame` unchanged and adds nothing.
- **PLAY-006** — **"try this" variant swaps the starter deterministically:** `selectVariant(id)`
  loads that variant's starter (compiled under the same subset), resets to cycle 0, and the same
  variant id always produces the same run; switching back to the original is likewise deterministic.
- **PLAY-007** — **goal status is queryable & deterministic:** with an embedded goal [06],
  `state.goal` exposes pass/fail/progress at the current cycle, is a pure deterministic function
  of engine state per seed (same config → same goal outcome at the same cycle), and is `undefined`
  when no goal is configured.
- **PLAY-008** — **starter compiles under the subset & loads (C-CON-COMPILES):**
  `normalizePlayground(cfg)` compiles the starter (and every variant, and any embedded solution)
  under the active subset via `@tierra26/genescript` and loads the bytes in `@tierra26/engine`
  with no illegal-opcode error; a starter/variant using a verb **outside** the subset fails
  normalization with a kid-friendly diagnostic (C-CON-SUBSET / C-GS-VALID).
- **PLAY-009** — **inject-edited-genome compiles, gates, and loads:** `injectEdited(source)`
  returns `{ok:true, creatureId}` for GeneScript valid under the subset (loaded via
  `engine.inject`) and `{ok:false, diagnostics}` — changing nothing in the running engine — for
  code that fails to compile or uses a gated verb (C-CON-COMPILES / C-CON-SUBSET / C-CON-KID).
- **PLAY-010** — **display options never affect the run:** changing `display` (panels), `setSpeed`,
  or `spotlight` produces the **same** `ObservationFrame` stream at every cycle as the default
  display — presentation hints are excluded from the deterministic recipe (C-CON-DET), and are
  absent from `toRunDescriptor(cfg)`.
- **PLAY-011** — **peek-under-hood exposes a source-mapped genome:** `state.genome` carries the
  GeneScript source, the compiled bytes, and a line↔byte source map (GSINV-SOURCEMAP) that lets a
  host highlight the executing instruction against its source line; for an edited/evolved genome
  with no authored source, `source` is the disassembly (GeneScript §5).
- **PLAY-012** — **it drives a real engine, independent per instance (C-SNAP):** controls map to
  real `@tierra26/engine` operations (`step`/`run`/`inject`), and two playgrounds on one page run
  fully independently with no shared module-level state (rests on API-010) — advancing one does
  not change the other's frames.
- **PLAY-013** — **contract, not renderer:** the module exposes only data (`PlaygroundConfig`/
  `PlaygroundState`) and behavior (`PlaygroundControls`) and references **no** DOM/host global
  (`window`/`document`/`self`) and no rendering — a source assertion (mirrors [15] API-006), so
  the same contract is drivable by any UI.

---

## 9. Open questions

1. **Observation cadence ownership.** Does the `PlaygroundConfig` fix the observation `topK`/frame
   cadence, or does the UI choose it (as [13] §9.3 leaves open)? Propose: cadence is presentation
   (UI-chosen, never in the recipe); `topK` has a documented default. Confirm it stays out of
   `toRunDescriptor`.
2. **`cyclesHint` vs goal window.** Should the "run to end" budget come from `cyclesHint`, the
   goal's `within` window [06], or the scenario? Propose `cyclesHint ?? goal.within ?? scenario
   default`, all deterministic.
3. **Variant/edit persistence in a share link.** When a learner edits or selects a variant, does
   the share link capture the edited genome (a new `starter`) or just the original config? Propose:
   sharing serializes the *current* effective config (edited starter inlined as GeneScript) so the
   recipe stays self-contained (C-CON-DET).
4. **Disassembly fidelity for spotlight.** For an evolved/edited genome, the source map is
   best-effort (GeneScript §5 raw fallback). Confirm the UI spotlight degrades gracefully (byte-
   range highlight when no clean source line exists).
5. **Multiple creatures / which to spotlight.** Once a starter replicates, which creature's
   registers/IP does peek-under-hood follow (the injected lineage? a UI selection)? Propose a
   host-selected focus creature id in the UI layer, not the config (keeps the recipe minimal).
