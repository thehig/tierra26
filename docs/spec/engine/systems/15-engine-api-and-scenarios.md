# Engine API & Scenarios — Engineering Spec              (Code: API · Milestone: M0)

**Status:** v1. The public surface of the engine and the **Scenario** configuration schema —
build step 12, the composition root's outward face (M0-TECH-DESIGN §17). This is the *only*
module a host (test harness, future Web Worker, future server) imports. It wires `world` +
`snapshot` + `config` into a small, pure, synchronous class and defines the `RunDescriptor`
that makes a run a shareable recipe.

**Upstream refs:**
[`00-architecture.md`](00-architecture.md) §2 (module dependency graph: `index ──▶ world,
snapshot, config`), §4 (Injection data-flow), §5 (all C-* contracts), §6 (glossary:
RunDescriptor, active set, genotype) ·
[`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §2 (module layout, boundary rule: "everything
under `engine/src` is pure and synchronous… the future Worker imports the same module"),
§5 (InstructionSet & subsets), §9 (slicer / `run` tick model), §14 (Engine API + Scenario +
Injection + RunDescriptor), §15 (Snapshot) ·
[`SPEC.md`](../../SPEC.md) §8 (three-layer architecture; engine reusable server-side),
§12 (determinism: a run defined by `(engineVersion, scenario, seed, genomes, cycles)`),
§9.4 (soup default 60000), §17 Decided-2 (classic-32 is *the* ISA; tutorials unlock subsets).

**Contracts obeyed:** **C-DET** (no `Math.random`/`Date.now`/float on any exposed path;
`run` executes whole slices in slicer-queue order), **C-ID** (`inject` returns a monotonic
`world.nextId` creature id), **C-SNAP** (`snapshot`/`restore`/`replay` rest on fully
serializable `World` state — no hidden module-level mutable state in `index.ts`), **C-INT**
(all scenario numerics are integers; ratios like `movPropThrDiv` held as scaled integers, not
floats, on the fate-bearing path).

---

## 1. Purpose & responsibility

This system owns the engine's **public API** and its **configuration schema**. It exposes an
`Engine` class constructed from a validated `Scenario`, with the four operations a host needs —
**`inject`** (place a genome in the soup and bring a creature to life), **`step`** (advance one
instruction), **`run`** (advance a whole-slice budget of instructions), and **`stats`** (a cheap
observation snapshot) — plus the reproducibility trio **`snapshot`/`restore`/`replay`**. It owns
the **`Scenario`** schema (soup size, active instruction set or tutorial subset, seed, slicer,
reaper, engine limits, mutation rates), its **defaults**, and its **validation** (rejecting
impossible configs *before* any state is built). It owns the **`RunDescriptor`** — the tiny
`{engineVersion, scenario, injections, cycles}` record that fully replays a run — and the
guarantee that `replay(desc)` reproduces a live run bit-for-bit. Critically, it owns the
**module-boundary contract**: this module is **pure and synchronous**, touches no DOM/`window`/
`self`/`document` and no wall-clock, so the *same* file is importable by a future M2 Web Worker
and reusable server-side for online Versus (SPEC §8) — determinism is a property of the module,
not of any host.

---

## 2. Interfaces

Defined in `packages/engine/src/index.ts` (the public surface) with the schema/validation split
into `packages/engine/src/config.ts`. `index.ts` imports **only** `world`, `snapshot`, and
`config` from `src/`; it imports nothing DOM/host-specific. It is the module every host imports;
no engine system imports *it* (top of the graph, §[00] §2).

```ts
// ---- Scenario configuration (config.ts) ----

// A tutorial subset: enable a named slice of the classic-32 dictionary.
// `include` lists InstrId mnemonics; nop0/nop1 are always implied (INV-TEMPLATE).
interface SubsetSpec {
  base: 'classic32';           // subsets are always over the classic-32 dictionary (SPEC §17-2)
  include: string[];           // mnemonics to enable, e.g. ['nop0','nop1','movDC','movii','ifz']
  name?: string;               // label for the active set, e.g. 'tutorial-ch3'
}

interface Scenario {
  soupSize: number;                    // default 60000 (SPEC §9.4); >= limits.maxCellSize and > 0
  instructionSet: 'classic32' | SubsetSpec;  // full ISA, or a tutorial subset
  seed: number;                        // uint32; seed 0 is normal & reproducible (§[01]). CANONICAL seed home (S14)
  slicer: {
    style: 'ran';                      // RanSlicerQueue (only style in M0)
    sizeDependent: boolean;            // false (DEFAULT, S6) = constant slice ⇒ big genomes cost more ⇒
                                       //   size is SELECTED AGAINST (the regime EVERY shipped Tierra
                                       //   experiment ran, SizDepSlice=0). true = slice ∝ size^slicePow
                                       //   (size-neutral; the C-header default, never used in a shipped run).
    slicePow: number;                  // default 1; size exponent when sizeDependent (SlicePow)
    sliceSize: number;                 // default 25; base slice when !sizeDependent (randomized [0,2·base])
  };
  reaper: {
    threshold: number;                 // soup-fullness fraction that triggers reaping,
                                       //   held as a scaled integer (per-1000); default 900/1000
    reapRndProp?: number;              // S23: random-victim proportion at queue top (scaled per-1000);
                                       //   default 0 (deterministic, M0). Tierra si*=300.
  };
  limits: {
    minCellSize: number;               // default 12  (mal below this raises E)
    searchLimitMult: number;           // default 5   (searchLimit = mult * avgSize)
    movPropThrDiv: number;             // default 0.7 (divide gate) — stored scaled, see §3
    minTemplSize: number;              // default 1   (shortest usable template)
    maxCellSize: number;               // default: soupSize (cap on mal size)
    dropDead?: number;                 // S28: instructions-since-reproduce before forced death;
                                       //   0 = off (default, M0). Tierra DropDead watchdog.
  };
  malMode: MalMode;                    // S7: allocation strategy. Default 'first-fit' — an explicit
                                       //   M0 DETERMINISM choice, NOT fidelity (shipped Tierra used
                                       //   better-fit/random, which enable spatial aggregation). Exposed
                                       //   so a scenario can select the reference strategy (M1).
  mutation: MutationRates;             // S8: FULL rate surface (owned by mutation [11]). M0: all 0 (breed true).
  disturbance?: { freq: number; prop: number };  // S24: periodic mass extinction; freq 0 = off (default).
                                                  //   Tierra DistFreq/DistProp (on in si3/si7).
  inoculation?: { placement: 'first-fit' | 'even' | 'explicit'; offsets?: number[] }; // S29: initial
                                       //   seed layout; default 'first-fit'. 'even'/'explicit' for
                                       //   symmetric placement (Versus [versus/03], multi-seed).
}

type MalMode = 'first-fit' | 'better-fit' | 'random' | 'near-mother' | 'near-dx' | 'near-sp';

// ---- Injection & replay (index.ts) ----

interface Injection {
  atCycle: number;             // cycle at which to inject (0 = before the run starts)
  genome: Uint8Array;          // opcode bytes (indices into the active set)
  founderId?: number;          // S1: Versus lineage tag stamped on the seed creature (default 0 = neutral)
}

interface RunDescriptor {
  engineVersion: string;       // pinned; a mismatch means "cannot guarantee replay"
  scenario: Scenario;          // the validated, defaults-filled scenario
  injections: Injection[];     // ordered by atCycle (stable)
  cycles: number;              // total instructions to execute
}

// The live scalar surface is owned by STATS [13] as `LiveStats` (single definition, S15).
// `stats()` returns it; do not redefine a second scalar type here.
import type { LiveStats } from './13-statistics-and-observation';

// ---- The public class (index.ts) ----

class Engine {
  constructor(scenario: Partial<Scenario>);  // validates + fills defaults, builds World

  inject(genome: Uint8Array, opts?: { founderId?: number }): CreatureId; // place; register; stamp founder (S1); return id
  step(): void;                              // execute exactly one instruction
  run(nInstructions: number): void;          // execute whole slices until the budget is met
  get cycles(): number;                      // instructions executed so far (world.cycles)
  stats(): LiveStats;                        // cheap live scalar surface (owned by [13], S15)

  snapshot(): Snapshot;                      // full deterministic state (§[14])
  static restore(s: Snapshot): Engine;       // reconstruct; continues bit-identically
  static replay(desc: RunDescriptor): Engine;// fresh → inject → run; equals a live run

  static readonly version: string;           // == RunDescriptor.engineVersion source of truth
}

// Exposed for hosts that want to validate/normalize a scenario without building an engine:
function normalizeScenario(s: Partial<Scenario>): Scenario;   // fill defaults + validate, or throw
```

- The constructor takes a **partial** scenario so a host may pass `{}` and get the documented
  defaults; `normalizeScenario` is the single validation/defaults entry point (used by both the
  constructor and `replay`).
- `inject` is the *only* way a genome enters the soup; it never mutates the scenario and is a
  pure function of current `World` state.
- `step`/`run` are the two clocks: `step` for golden single-instruction tests and UI stepping,
  `run` for budgeted advancement (whole slices, §[09]).

---

## 3. Data structures

The API layer holds almost no state of its own — it is a thin, validating façade over a `World`.

| Field | Type | Units / domain | Why |
|---|---|---|---|
| `Engine.world` | `World` | — | the single composition root (§[00] §3); all state lives here |
| `Engine.scenario` | `Scenario` | normalized | the frozen, defaults-filled config; re-serialized into `RunDescriptor`/`Snapshot` |
| `Scenario.soupSize` | int | `> 0`, `>= maxCellSize` | soup byte count; default **60000** |
| `Scenario.seed` | int | `[0, 2^32)` | PRNG seed; 0 is normal (§[01]) |
| `Scenario.reaper.threshold` | int | per-1000 fullness | reaping trigger; default **900** (=0.9) |
| `limits.minCellSize` | int | bytes | default **12**; `mal(size < 12)` → `raiseE` |
| `limits.searchLimitMult` | int | multiplier | default **5**; `searchLimit = mult · avgSize` |
| `limits.movPropThrDiv` | int (scaled ×1000) | per-1000 | default **700** (=0.7); divide legal at `dauWritten·1000 ≥ movPropThrDiv·dauSize` |
| `limits.minTemplSize` | int | bytes | default **1** |
| `limits.maxCellSize` | int | bytes | default **= soupSize** |
| `mutation.{flaw,copy,cosmic}` | int | rate | M0 **0** (breed true) |

Invariants:
- **API-SCEN-INTEGER:** every fate-bearing scenario numeric is an integer at rest. Ratios the
  *spec* writes as decimals (`movPropThrDiv: 0.7`, `reaper.threshold` as a fraction) are stored
  **scaled to integers** (×1000) so no float touches a simulation path (C-INT/C-DET). The
  decimal spelling in §14 is the author-facing sugar; `normalizeScenario` scales it.
- **API-SCEN-COMPLETE:** after `normalizeScenario`, every optional field is present at its
  documented default — downstream systems read a fully-populated `Scenario`, never `undefined`.
- **API-SCEN-FROZEN:** the normalized `Scenario` is deep-frozen; neither `run` nor `inject`
  mutates it, so the same object round-trips into `snapshot`/`RunDescriptor` unchanged.
- **API-NO-HIDDEN-STATE:** `index.ts` holds no module-level mutable state (C-SNAP). Two engines
  in the same process are fully independent; the only module-level constant is `Engine.version`.

---

## 4. Behavior / algorithms

### 4.1 Construction & normalization

```
new Engine(partial):
    scenario = normalizeScenario(partial)     # fill defaults, validate, scale ratios, deep-freeze
    world    = makeWorld(scenario)            # soup(soupSize), rng(seed), empty queues, cycles=0
    return engine wrapping world + scenario
```

```
normalizeScenario(partial):
    s = deepMerge(DEFAULTS, partial)          # DEFAULTS fills soupSize 60000, limits, slicer, etc.
    resolveInstructionSet(s.instructionSet)   # 'classic32' → full set; SubsetSpec → §4.4
    validate(s)                               # §4.5 — throw on any impossible value
    scaleRatios(s)                            # movPropThrDiv/reaper.threshold → integers ×1000
    return deepFreeze(s)
```

### 4.2 `inject(genome)` — bring a genome to life `[MOD]`

Mirrors §[00] §4 "Injection" exactly:

```
inject(genome):
    assertValidGenome(genome)                 # bytes < activeSet.n; length in [minCellSize, soupSize]
    start = alloc.findFree(genome.length)     # first free gap (§[03]); no reaping on inject
    if start < 0: throw  (soup has no gap this large — an injection error, not raiseE)
    soup.writeBytes(start, genome)            # direct write (injection bypasses protection)
    c = makeCreature(id=world.nextId++, start, size=genome.length)  # C-ID monotonic
    c.cpu.ip = start; zero registers/stack/flags
    genebank.assignGenotype(c)                # FNV-1a hash → genotypeId (§[12])
    scheduler.enqueue(c); reaper.enqueue(c)   # into both queues (INV-QUEUE)
    world.creatures.set(c.id, c)
    return c.id
```

- The returned id is **stable**: it is `world.nextId` at inject time and never reused, so a host
  can track the injected creature across steps.
- Injection **does not** trigger the reaper (unlike `mal`); a soup too full to place the genome
  is a host-facing error (throw), because injection is an authoring action, not a creature fault.

### 4.3 `step()` and `run(n)` — the two clocks `[MOD]`

```
step():  world.stepOne()                      # exactly one fetch-decode-execute; cycles += 1

run(n):                                        # whole-slice budget (M0-TECH-DESIGN §9)
    target = world.cycles + n
    apply any injections whose atCycle <= world.cycles (and become due during the loop)
    while world.cycles < target and world.population > 0:
        c = scheduler.next()                  # round-robin slicer-queue order (C-DET)
        world.runSlice(c)                     # sliceSize(c) instructions, breaking early if c dies
        applyDueInjections(world.cycles)
    # cycles may overshoot target by < one slice; see §6 (API-004 tolerance)
```

- `run` advances by *whole slices*, so `cycles` after `run(n)` is `≈ n` (within one slice), **not**
  exactly `n`. `step` is the exact single-instruction clock.
- If the population reaches 0, `run` stops early (no work to do) — `cycles` then reflects only
  what executed.

### 4.4 Choosing an active subset for tutorials `[MOD]`

A tutorial scenario passes `instructionSet: { base:'classic32', include:[...] }`. Resolution:

```
resolveInstructionSet(spec):
    if spec == 'classic32': return CLASSIC32          # the full 32-op named set (§[04])
    # SubsetSpec:
    ids = spec.include mapped to InstrIds via the dictionary   # unknown mnemonic → validation error
    ensure nop0 & nop1 present (add if omitted)        # INV-TEMPLATE: opcodes 0/1 always exist
    build an InstructionSet over exactly those ids:
        opcodeToId in a stable, spec'd order (nop0=0, nop1=1, then include-order)
        n = ids.length; bitWidth = ceil(log2 n)        # mutation domain (§[04]/§[11])
    return that set
```

- Subsets are **just a smaller `InstructionSet` over the same dictionary** (M0-TECH-DESIGN §5):
  handlers dispatch on `InstrId`, so no handler changes for a subset. A genome authored for a
  subset uses opcode bytes in `[0, n)`; the same bytes mean different things under a different
  active set, which is intended (opcode = index into the active set, §[00] §6).
- This is the mechanism by which tutorials "unlock instructions gradually" (SPEC §9.2/§17-2)
  without any special engine code — the engine is agnostic to which set is active.

### 4.5 Validation (reject impossible scenarios) `[MOD]`

`validate(s)` throws (a typed `ScenarioError`) — it never silently clamps — on:

- `soupSize <= 0`, non-integer, or `< limits.maxCellSize`.
- `instructionSet` is neither `'classic32'` nor a `SubsetSpec` with `base:'classic32'`; or a
  `SubsetSpec.include` naming an **unknown mnemonic** (not in the classic-32 dictionary).
- `limits.minCellSize < 1`, `limits.maxCellSize > soupSize`, `minCellSize > maxCellSize`.
- `movPropThrDiv` outside `(0, 1]`, `reaper.threshold` outside `(0, 1]` (before scaling).
- `slicer.style != 'ran'` (only style in M0) or non-integer `slicePow`.
- `seed` not coercible to a uint32; `mutation` rates negative (or non-zero in an M0 build that
  asserts "breed true", if that guard is enabled).

### 4.6 `stats()` — cheap observation `[MOD]`

```
stats():
    return {
      population: world.creatures.size,
      genotypes:  count of distinct genotypeId over live creatures,   # M0: from genebank hook (§[12])
      births:     world.births,
      deaths:     world.deaths,
      fullness:   floor(occupiedBytes * 1000 / soupSize),             # scaled integer (C-INT)
    }
```

`stats` is read-only and allocation-light; full histograms/observation snapshots are M1 (§[13]).

### 4.7 `snapshot`/`restore`/`replay` — reproducibility `[CORE]`

```
snapshot():  return serialize(world, scenario, Engine.version)        # §[14]
restore(s):  world = deserialize(s); rebuild Engine; continues bit-identically  (INV-ROUNDTRIP)

replay(desc):
    assert desc.engineVersion == Engine.version    # else: refuse (cannot guarantee bit-parity)
    e = new Engine(desc.scenario)
    for inj in desc.injections sorted by atCycle:   # deterministic order
        # injections with atCycle=0 happen before any run; later ones during run() (§4.3)
    e.run(desc.cycles) with injections applied at their atCycle
    return e                                        # e's snapshot digest == a live run's (INV-REPLAY)
```

`replay` is the backbone of golden tests, lesson sharing, and (later) Versus match sharing
(SPEC §6/§12) — a run is a tiny `RunDescriptor`, not a recording.

---

## 5. Interconnections

- **Imports (down only, §[00] §2):** `world` (constructs via `makeWorld`, drives `stepOne`/
  `runSlice`, reads `creatures`/`births`/`deaths`/`cycles`), `snapshot` (serialize/deserialize),
  `config` (schema, `DEFAULTS`, `normalizeScenario`, `validate`). Transitively reaches the
  dictionary (§[04]) to resolve subsets and the allocator (§[03]) via `inject`.
- **Imported by:** *hosts only* — the M0 test harness, the M2 Web Worker wrapper, and a future
  server-side Versus runner. No engine system imports `index.ts`; it is the top of the graph, so
  there are no cycles.
- **Called during a run:** `run` calls `scheduler.next()` in slicer-queue order (C-DET) and
  `world.runSlice`; `inject` calls `alloc.findFree` (§[03]), `genebank.assignGenotype` (§[12]),
  and both queue enqueues (§[09]/§[10]).
- **Contracts crossed:** C-DET (the public entry points must never introduce nondeterminism —
  no `Date.now`, no `Math.random`, no float, no map-order iteration on a fate path), C-ID
  (`inject` returns `world.nextId`), C-SNAP (the whole surface rests on serializable `World`
  state; `index.ts` adds none of its own), C-INT (scenario ratios stored scaled).
- **The boundary contract (SPEC §8, M0-TECH-DESIGN §2):** this module references **no** DOM or
  host global. That is *the* property that lets the identical file run in a Worker (M2) and on a
  server (online Versus) — a source assertion (API-006) guards it.

---

## 6. Determinism & edge cases

- **`run(n)` is whole-slice, not exact:** `cycles` after `run(n)` may overshoot `n` by up to one
  slice (a slice runs to completion). Tests assert `cycles ∈ [n, n + maxSliceSize)` (API-004),
  not `== n`. Use `step` when an exact instruction count is required.
- **Injection ordering:** `RunDescriptor.injections` is applied in `atCycle` order; ties are
  broken by array order (stable) so replay is deterministic (INV-REPLAY). An `atCycle` in the
  past (< current cycle) at `replay` time applies immediately at the next loop check.
- **Empty-population run:** `run` on a soup with no live creatures is a no-op; `cycles` unchanged.
- **Inject into a full soup:** throws (host error) — injection never reaps. Distinct from `mal`
  hitting a full soup, which reaps (§[03]/§[10]). FIXME hazard: don't route inject through the
  reap-to-make-room path or a lesson's inject could silently kill the creature it's teaching.
- **Genotype count under sterile conditions:** with mutation 0, injecting the ancestor and
  running yields exactly **1** live genotype (breed-true, M0-TECH-DESIGN §16.2) — `stats().
  genotypes == 1` (API-005).
- **`fullness`/ratios are scaled integers:** `stats().fullness` and stored `movPropThrDiv`/
  `reaper.threshold` are per-1000 integers; a host wanting a float divides by 1000 in the
  *presentation* layer only (C-DET keeps floats out of the engine).
- **Scenario immutability:** a host mutating the object it passed in must not affect a running
  engine — the normalized scenario is deep-frozen and (defensively) copied (API-SCEN-FROZEN).
- **Version mismatch on replay:** `replay` with `desc.engineVersion != Engine.version` refuses
  (throws) rather than silently producing a possibly-divergent run (API-007).
- **Purity / worker-portability:** no exposed method reads `Date.now`, `Math.random`, `window`,
  `self`, `document`, or any DOM/global — asserted by a source-grep test (API-006). This is what
  makes the module worker- and server-portable (SPEC §8).

---

## 7. Fidelity notes

- **[MOD] Modern API over a faithful engine.** The `Engine` class, `Scenario` object, and
  `RunDescriptor` have **no analogue** in Tierra — the original is configured by a `soup_in`
  file and global C variables, driven by a UNIX event loop, and observed through bespoke tools
  (`10-tools-and-uis`). We expose a small, typed, embeddable API instead. *Why:* the product runs
  in a browser Worker and (later) a server, embedded in tutorials and Versus; a clean class with
  an explicit config is the modernization. The **dynamics underneath are faithful** — the API
  only wires the CORE systems (slicer, reaper, template addressing, the 0.7 divide gate) and adds
  no new behavior.
- **[MOD] Config as data, defaults centralized.** Tierra scatters tunables across `soup_in` and
  compile-time macros; we collect them into one validated `Scenario` with defaults matching the
  reference values (soup 60000, `MinCellSize` 12, `MovPropThrDiv` 0.7, `SearchLimit` ×5). *Why:*
  a `RunDescriptor` must fully capture a run in a tiny record (SPEC §12) — so every knob lives in
  one serializable place, not in the binary.
- **[MOD] Subsets via named sets.** Tierra has no tutorial-subset notion; we reuse the
  `InstructionSet` mask mechanism (§[04]) so a scenario can enable a slice of the classic-32.
  *Why:* progressive disclosure for learners (SPEC §9.2/§17-2) with zero engine-behavior change.
- **[CORE] Reproducibility.** `replay(desc)` preserving bit-identity is the direct descendant of
  Tierra's seed-reproducibility — the property that made runs shareable. Non-negotiable (SPEC §12).
- **[OPTIONAL] Worker message protocol.** The async wrapper that posts messages to/from the
  Worker is **M2 UI**, not part of this pure module. The API is *designed* worker-ready
  (synchronous, DOM-free) so the wrapper is a thin adapter, not a rewrite (M0-TECH-DESIGN §1/§2).

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[API-NNN] …')` in `packages/engine/test/15-api.test.ts`.
IDs are append-only.

- **API-001** Default scenario: `new Engine({})` (or `normalizeScenario({})`) yields a scenario
  with every documented default present — `soupSize == 60000`, `instructionSet == 'classic32'`,
  `slicer == {style:'ran', sizeDependent:true, slicePow:1}`, `limits.minCellSize == 12`,
  `searchLimitMult == 5`, `movPropThrDiv == 0.7` (700 scaled), `minTemplSize == 1`,
  `maxCellSize == soupSize`, and `mutation == {flaw:0, copy:0, cosmic:0}`.
- **API-002** Invalid scenario rejected: `soupSize` below `maxCellSize`/`<= 0`, and an
  `instructionSet` naming an **unknown** set/mnemonic, each throw a typed error from
  `normalizeScenario`/the constructor (validation never silently clamps).
- **API-003** `inject(genome)` places the genome at the first free gap, returns a **stable,
  monotonic** creature id (C-ID), and registers a **genotype** (the injected creature has a
  `genotypeId`; `stats().genotypes >= 1`). A second inject returns a strictly greater id.
- **API-004** `run(n)` advances `cycles` by **≈ n**: after `run(n)`, `cycles` lies in
  `[n, n + maxSliceSize)` (whole-slice budget), and `step()` advances `cycles` by exactly 1.
- **API-005** `stats()` reflects the run: `population`, `births`, `deaths` track the world's
  counters; under mutation-0 sterile conditions `genotypes == 1` (breed true); `fullness` grows
  from 0 toward the reaper threshold as the soup fills, as a per-1000 integer.
- **API-006** Purity / worker-portability: the module (`index.ts` + `config.ts`) reads **no**
  DOM/host global — no `window`, `self`, `document`, `Math.random`, or `Date.now` (source
  assertion), so the identical module is importable by a Web Worker and server-side.
- **API-007** `replay(desc)` reproduces a run: `Engine.replay(desc)` produces a snapshot digest
  **equal** to a live `new Engine(desc.scenario) → inject → run(desc.cycles)`; a `RunDescriptor`
  with a mismatched `engineVersion` is refused (throws).
- **API-008** Tutorial subset: a `SubsetSpec {base:'classic32', include:[...]}` builds an active
  set containing exactly the requested instructions **plus** `nop0`/`nop1` (INV-TEMPLATE), with
  `n == set size`; a subset naming an unknown mnemonic is rejected (API-002).
- **API-009** `snapshot()`/`restore()` round-trip: `Engine.restore(e.snapshot())` continues
  bit-identically for N further cycles (delegates to §[14] INV-ROUNDTRIP; asserted here at the
  API surface).
- **API-010** Synchronous & re-entrant: `step`/`run`/`stats`/`inject` return synchronously (no
  Promise), and two `Engine` instances in one process are fully independent (no shared
  module-level state, C-SNAP).

---

- **API-011** — `normalizeScenario` fills the full documented defaults — `slicer.sizeDependent=false` (S6, size-selecting), `slicer.slicePow=1`, `slicer.sliceSize=25`, `malMode=’first-fit’` (S7), `mutation` = all-zero `MutationRates` (S8), `disturbance`/`dropDead`/`inoculation` off/default — and validates (rejects out-of-range).
- **API-012** — `inject(genome, {founderId})` stamps the seed creature’s `founderId` (default 0 = neutral) — the value the engine propagates on divide (S1).

## 9. Open questions

1. **Ratio scaling granularity (API-SCEN-INTEGER).** Store `movPropThrDiv`/`reaper.threshold` as
   per-1000 integers, or a finer fixed-point (per-65536)? Propose per-1000 — matches the
   reference's decimal tunables and is exact for 0.7/0.9. Confirm no gate needs sub-0.1% precision.
2. **`inject` timing in `RunDescriptor` (API-007).** Are `atCycle` injections applied *before* or
   *after* the slice that crosses that cycle? Propose "checked between slices" (§4.3); pin the
   exact boundary so replay is unambiguous.
3. **`run(n)` overshoot (API-004).** Accept overshoot up to one slice, or add a `runExact(n)` that
   stops mid-slice (breaking a creature's slice early)? Propose whole-slice `run` + exact `step`;
   add `runExact` only if a lesson needs a precise cycle count.
4. **Subset opcode ordering (API-008).** Fix `nop0=0, nop1=1` then include-order — or sort
   `include` canonically so two authorings of the same subset produce identical opcode maps?
   Propose canonical-sort after the two nops, so a subset's genome encoding is stable regardless
   of author list order.
5. **M0 non-zero mutation guard.** Should an M0 build *reject* non-zero mutation rates (enforcing
   "breed true"), or accept them as a forward-compatible seam that simply has no effect yet?
   Propose: accept + document as no-op in M0 (seams present, §[11]); revisit at M1.
