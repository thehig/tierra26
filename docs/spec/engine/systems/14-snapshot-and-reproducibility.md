# Snapshot & Reproducibility — Engineering Spec              (Code: SNAP · Milestone: M0)

**Status:** v1. The reproducibility contract for the whole engine — build step 10
(M0-TECH-DESIGN §17), and the doc that **owns the cross-cutting invariants**
`INV-DET` / `INV-REPLAY` / `INV-ROUNDTRIP`. A run is a pure function of
`(engineVersion, scenario, seed, injections, cycles)`; this system is where that promise is
serialized, restored, replayed, and *tested*.

**Upstream refs:**
[`00-architecture.md`](00-architecture.md) §5 (C-DET, C-SNAP, C-ID, C-INT; the INV-* catalog),
§6 (glossary: RunDescriptor, cycle) ·
[`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §3 (determinism contract), §14 (Engine API,
`RunDescriptor`, `replay`), §15 (snapshot / serialization), §16.3–16.4 (golden fixtures +
property/invariant test layer) ·
[`01-determinism-and-rng.md`](01-determinism-and-rng.md) §2 (`state()`/`setState()`/`clone()`
seam — the 4 RNG words this system serializes).
**Reference (fidelity only):** `docs/original-tierra/07-ancestor-and-formats.md`
§"`soup_out` / `core_out` — saved state & restart" — Tierra checkpoints the whole machine
(soup, `is` IP state, `TrandArray[98]`, reaper-queue indices, `cells[][]`, `FreeMemry`,
templates) every `SaveFreq` and resumes exactly (`tsetup.c:4116` `SavDynMem`, `tsetup.c:4195`
`ReadDynMem`). Our `Snapshot` is the modern equivalent; our `RunDescriptor` is the modern
equivalent of `soup_in` + inoculation list. This doc describes **our** design; Tierra is
cited to ground the [CORE] fidelity claim.

**Contracts obeyed:** **C-SNAP** (all simulation state lives in `World`/its members and is
serializable; no hidden module-level mutable state — this system *is* the enforcement point),
**C-DET** (restore/replay reproduce the fixed RNG call order and queue-ordered traversal),
**C-ID** (`nextId` is captured so post-restore births keep monotonic ids), **C-INT** (every
serialized field is an integer / integer array; no floats on the round-trip path).

---

## 1. Purpose & responsibility

This system owns the engine's **reproducibility contract** and its three artifacts.
(1) **Snapshot** — a complete, serializable freeze of a live `World`: `engineVersion`,
`scenario`, `cycles`, `nextId`, the RNG's 4 state words, the full soup bytes, and **every**
creature (cell bounds, full CPU, daughter-copy fields, both queue positions, lifecycle
bookkeeping, and `genotypeId`). (2) **Restore** — `restore(snapshot(e))` reconstructs an
engine that continues execution **bit-identically** to the original: same next instruction,
same next RNG draw, same births at the same cycles. (3) The **RunDescriptor** — the compact
replay recipe `{engineVersion, scenario, seed, injections[], cycles}` from which
`Engine.replay(desc)` rebuilds a run (fresh engine → inject genomes at their cycles → run to
`cycles`) that **must equal** the corresponding live run. It also defines the **run digest**
(population, genotype count, births, deaths, soup checksum at cycle N) used to freeze golden
fixtures cheaply, and the **engineVersion** gate that refuses cross-version replay/restore. It
guarantees that a `Snapshot` captures enough to be a fixed point of `snapshot∘restore`, that
`replay` and a live run are indistinguishable by digest, and that two engines fed the same
descriptor stay in lock-step. This system does not *produce* state (World does); it freezes,
thaws, re-derives, and verifies it.

---

## 2. Interfaces

Defined in `packages/engine/src/snapshot.ts`, with the `Engine`-facing surface in
`index.ts` (§M0-TECH-DESIGN §14). `snapshot.ts` imports `world` (and transitively its
members); it is imported by `index.ts`. It imports nothing above `World`.

```ts
// A complete, serializable freeze of a running engine. Every field is a plain integer,
// string, or integer-typed array — structured-clone- and JSON(+base64)-safe.
interface Snapshot {
  engineVersion: string;       // the producing engine's version; gates restore (§4.5)
  scenario: Scenario;          // the full config the World was built from (soupSize, set, limits…)
  cycles: number;              // global instruction clock at freeze time
  nextId: CreatureId;          // the monotonic id counter (C-ID) — next birth resumes here
  rngState: Uint32Array;       // exactly 4 words = rng.state() (01-determinism §2)
  soup: Uint8Array;            // the whole soup, length scenario.soupSize
  births: number; deaths: number;   // World counters (digest inputs)
  creatures: CreatureSnapshot[];    // in slicer-queue order (deterministic; §3)
}

// One creature, fully. No object references — queues stored as positions, not links.
interface CreatureSnapshot {
  id: CreatureId; parentId: CreatureId;
  start: Addr; size: number;                 // mother cell [start, start+size)
  reg: Int32Array;                           // CPU: 4 registers A..D (signed 32)
  ip: Addr; stack: Int32Array; sp: number;   // CPU: IP, 10-deep stack, stack pointer
  flagE: boolean; flagS: boolean; flagZ: boolean;   // CPU flags
  dauStart: Addr; dauSize: number;           // daughter block (-1 / 0 when none)
  dauWritten: number; dauWriteMask?: Uint8Array;    // distinct-write count + bitmask (0.7 gate)
  bornAtCycle: number; errorCount: number;   // bookkeeping (reaper input, digest input)
  genotypeId: number;                        // genebank hook value assigned at birth
  slicerPos: number; reaperPos: number;      // queue positions (INV-QUEUE), not pointers
}

// The full replay recipe (00-architecture glossary; M0-TECH-DESIGN §14).
interface Injection { atCycle: number; genome: Uint8Array; }
interface RunDescriptor {
  engineVersion: string;
  scenario: Scenario;
  seed: number;                // convenience mirror of scenario.seed (canonical source: scenario)
  injections: Injection[];     // sorted by atCycle; applied when world.cycles reaches atCycle
  cycles: number;              // total instructions to run
}

// The cheap comparison surface for goldens + property tests.
interface RunDigest {
  atCycle: number;
  population: number; genotypes: number;
  births: number; deaths: number;
  soupChecksum: number;        // FNV-1a (uint32) over the whole soup at atCycle
}

// snapshot.ts
function snapshot(w: World): Snapshot;
function restore(s: Snapshot): World;            // throws on engineVersion mismatch (§4.5)
function digest(w: World, atCycle: number): RunDigest;

// index.ts (Engine facade over the above)
class Engine {
  snapshot(): Snapshot;
  static restore(s: Snapshot): Engine;           // wraps restore(); gates version
  static replay(desc: RunDescriptor): Engine;    // fresh → inject → run; == live run (§4.4)
  digest(): RunDigest;
}
```

- `snapshot()` is a **deep, reference-free** capture: creatures are emitted in **slicer-queue
  order** (deterministic per C-DET), and queue links become integer **positions** so the graph
  is a flat, serializable array (C-SNAP).
- `restore()` is the inverse: rebuild `World`, `setState` the RNG from the 4 words, memcpy the
  soup, rebuild each `Creature`, then **relink** the slicer and reaper queues from the stored
  positions (§4.2).
- `replay(desc)` never reads a `Snapshot`; it re-derives the entire run from the descriptor
  and is the backbone of golden tests and (later) match sharing.

---

## 3. Data structures

The `Snapshot` mirrors `World` field-for-field; the design constraint (C-SNAP) is that
**there is nothing to capture that is not reachable from `World`** — no module-level mutable
state, no closures holding simulation data, no `Date`/wall-clock.

| Field | Type | Units / domain | Why it must be captured |
|---|---|---|---|
| `engineVersion` | `string` | semver-ish tag | gates cross-version restore/replay (§4.5) |
| `scenario` | `Scenario` | config | soup size, active set, limits, mutation rates — restore rebuilds the exact `World` shape |
| `cycles` | `number` | integer instruction clock | the global clock; digests and injections key off it |
| `nextId` | `CreatureId` | integer, monotonic | C-ID: births after restore must not reuse ids |
| `rngState` | `Uint32Array(4)` | 4× `[0,2^32)` | the *entire* RNG state (01-determinism §3); without it the next draw diverges |
| `soup` | `Uint8Array` | length `soupSize`, bytes = opcodes | the shared memory; the substrate every creature reads/executes |
| `births`,`deaths` | `number` | integer counters | digest inputs; part of observable state |
| `creatures[]` | `CreatureSnapshot[]` | slicer-queue order | the population; order is itself state (C-DET) |
| per-creature CPU | `reg/ip/stack/sp/flags` | Int32Array + int + bool | the exact execution point — restore continues mid-instruction-stream |
| per-creature daughter | `dauStart/dauSize/dauWritten/dauWriteMask` | ints + bitmask | mid-reproduction creatures must resume the copy loop and pass the 0.7 gate identically |
| per-creature bookkeeping | `bornAtCycle/parentId/errorCount/genotypeId` | ints | reaper ordering + digest + lineage |
| per-creature queues | `slicerPos/reaperPos` | integer positions | INV-QUEUE: reconstruct exactly-one-slicer / exactly-one-reaper membership |

Invariants this structure holds (verified on restore, §6):
- **SNAP-STATE-COMPLETE:** every mutable field of `World` and each `Creature` appears above;
  `restore(snapshot(e))` shares no state with `e` yet is behaviorally identical.
- **SNAP-QUEUE-FLAT:** queues are stored as positions, never as object pointers; relinking is
  a deterministic function of `slicerPos`/`reaperPos` (re-establishes INV-QUEUE).
- **SNAP-INT-DOMAIN:** every serialized numeric field is an integer or integer-typed array
  (C-INT); `soupChecksum` is a uint32. No floats cross the round-trip.

---

## 4. Behavior / algorithms

### 4.1 `snapshot(world)` — freeze `[CORE]`

```
snapshot(w):
  s = {}
  s.engineVersion = ENGINE_VERSION            # the module constant, not a runtime clock
  s.scenario      = deepCopy(w.scenario)       # config is plain data
  s.cycles        = w.cycles
  s.nextId        = w.nextId
  s.rngState      = w.rng.state().slice()      # copy the 4 words (no shared buffer)
  s.soup          = w.soup.bytes.slice()       # copy the whole Uint8Array
  s.births        = w.births; s.deaths = w.deaths
  s.creatures     = []
  for c in w.slicerOrder():                    # deterministic traversal (C-DET), NOT map order
     s.creatures.push(freezeCreature(c))       # copies CPU arrays, daughter mask, positions
  return s
```

- Traversal is **slicer-queue order** so two equal `World`s always emit byte-identical
  snapshots (foundation of INV-DET). Never iterate the `id→Creature` `Map`.
- Every typed array is `.slice()`d — the snapshot must not alias live buffers (else a
  subsequent `run` would mutate the "frozen" copy).

### 4.2 `restore(snapshot)` — thaw `[CORE]`

```
restore(s):
  assertVersion(s.engineVersion)               # §4.5 — throws before touching anything
  w = new World(s.scenario)                     # builds soup buffer, empty queues, fresh rng
  w.cycles = s.cycles; w.nextId = s.nextId
  w.births = s.births; w.deaths = s.deaths
  w.rng.setState(s.rngState)                    # 01-determinism §2 — restores the 4 words
  w.soup.bytes.set(s.soup)                       # memcpy soup back
  built = []
  for cs in s.creatures:                         # array is already in slicer order
     c = thawCreature(cs)                         # rebuild Creature, CPU arrays, daughter mask
     w.creatures.set(c.id, c)                     # id → object lookup (Map; not order-bearing)
     built.push(c)
  relinkSlicer(w, built, byField='slicerPos')     # rebuild intrusive doubly-linked slicer ring
  relinkReaper(w, built, byField='reaperPos')     # rebuild reaper queue head→tail
  assertInvariants(w)                             # INV-MEM, INV-QUEUE (dev builds); §6
  return w
```

- The RNG state is restored via `setState` (never re-seeded) — this is why the very next
  `int(n)` draw, rejections included, matches the original (01-determinism §4.3).
- Queues are rebuilt purely from `slicerPos`/`reaperPos`, re-establishing INV-QUEUE: every
  live creature in exactly one slicer position and one reaper position.

### 4.3 `digest(world, atCycle)` — the cheap fingerprint `[CORE]`

```
digest(w, atCycle):
  return {
    atCycle,
    population: w.slicerOrder().length,
    genotypes:  distinct genotypeId over live creatures,
    births: w.births, deaths: w.deaths,
    soupChecksum: fnv1a32(w.soup.bytes),          # uint32 rolling hash over all soup bytes
  }
```

- A digest is what golden fixtures freeze (M0-TECH-DESIGN §16.3): tiny, diff-able, and
  sufficient to detect any trajectory change. Two runs are "equal" iff their digest sequences
  at the same checkpoints match — the operational definition used by INV-REPLAY / INV-DET.
- `soupChecksum` is FNV-1a in the uint32 domain (same family as the genebank genome hash,
  M0-TECH-DESIGN §13) so it is integer-only and cross-engine stable.

### 4.4 `Engine.replay(desc)` — re-derive a run `[CORE]`

```
replay(desc):
  assertVersion(desc.engineVersion)
  e = new Engine(desc.scenario)                    # fresh world, rng seeded from scenario.seed
  pending = desc.injections sorted by atCycle
  while e.cycles < desc.cycles:
     while pending and pending[0].atCycle == e.cycles:
        e.inject(pending.shift().genome)           # place at first free gap, register, enqueue
     e.run( nextStop(pending, desc.cycles) - e.cycles )   # run to next injection or to end
  # any injections whose atCycle == desc.cycles are applied at the boundary before returning
  return e
```

- **Contract (INV-REPLAY):** for the same `desc`, `replay(desc).digest()` equals the digest of
  a *live* run that seeded from `scenario.seed`, injected the same genomes at the same cycles,
  and ran the same number of cycles. `replay` is not a shortcut — it is the same computation,
  reconstructed only from the recipe, proving the run needs nothing but the descriptor.
- Injection timing is cycle-keyed and deterministic: `run(n)` stops on whole-slice boundaries
  (M0-TECH-DESIGN §9), so `replay` runs slices *up to* each injection cycle, injects, and
  continues. Injection placement (first free gap) is itself deterministic (allocator, §8).

### 4.5 Versioning — the cross-version gate `[CORE]`

```
assertVersion(v):
  if v != ENGINE_VERSION:
     throw new VersionMismatchError(v, ENGINE_VERSION)
```

- A `Snapshot`/`RunDescriptor` produced by engine version X is **not** silently restored or
  replayed by version Y. Determinism is only promised *within* a version: any change to the
  ISA, slicer math, allocator order, or RNG algorithm can shift trajectories, so a
  cross-version restore that "worked" would be a correctness landmine.
- `ENGINE_VERSION` is a module constant embedded in every `snapshot()` and required in every
  `RunDescriptor`. The gate is exact-match in M0 (no compatibility ranges yet — see §9).

---

## 5. Interconnections

- **Called by:** `index.ts` (the `Engine` facade) — `Engine.snapshot/restore/replay/digest`
  are thin wrappers; the Engine API doc [15] specifies the public surface and Scenario shape.
- **Reads / rebuilds:** `world.ts` — `snapshot` reads every `World` field via the deterministic
  slicer traversal; `restore` constructs a fresh `World` and repopulates it. It touches
  `soup.ts` (byte buffer copy), `creature.ts` (CPU + daughter fields), `scheduler.ts` /
  `reaper.ts` (queue relink), and `rng.ts` (`state`/`setState`).
- **Depends on RNG seam:** `01-determinism-and-rng.md` §2 — the snapshot *is* the 4 words
  `state()` returns; restore is `setState` of exactly those words. This is the single most
  important field for bit-identical continuation.
- **Feeds:** the golden-fixture harness (`test/golden/`, M0-TECH-DESIGN §16.3) freezes
  `RunDigest` sequences; the property/invariant layer (§16.4) asserts INV-DET / INV-REPLAY /
  INV-ROUNDTRIP against `Engine.replay` + `snapshot`/`restore`.
- **Contracts crossed:** C-SNAP (this system enforces "all state in World, nothing hidden" —
  if a new mutable field is added anywhere and *not* serialized here, INV-ROUNDTRIP fails,
  which is the intended tripwire), C-DET (deterministic traversal on capture; RNG/queue order
  on restore), C-ID (`nextId` carried across restore), C-INT (integer-only serialized domain).

---

## 6. Determinism & edge cases

- **Traversal order on capture:** creatures are frozen in slicer-queue order, never `Map`
  order. Two structurally-equal worlds therefore serialize identically byte-for-byte — the
  basis of INV-DET (SNAP-004). A regression to map-order iteration would make snapshots
  non-deterministic without breaking any single-engine test; INV-DET guards it explicitly.
- **RNG rejections survive round-trip:** because the full 4-word state is captured (not a seed
  + call count), restore resumes mid-rejection-sequence exactly (01-determinism §4.3). A run
  that restores at cycle N and continues must draw the same values as one that never stopped
  (INV-ROUNDTRIP, SNAP-002).
- **Mid-reproduction creatures:** a creature captured between `mal` and `divide` carries
  `dauStart/dauSize/dauWritten/dauWriteMask`; restore must resume the copy loop and hit the
  0.7 divide gate at the identical cycle (SNAP-002 covers "continues bit-identically for N
  cycles", which includes in-flight daughters). FIXME hazard: forgetting the `dauWriteMask`
  makes the gate pass/fail differently after restore — a subtle divergence, explicitly in
  scope of the round-trip test.
- **Buffer aliasing:** `snapshot` must `.slice()` the soup and every typed array; a shared
  buffer would let a later `run()` corrupt the frozen snapshot (and vice-versa on restore).
  SNAP-STATE-COMPLETE / independence is asserted (SNAP-007).
- **Empty population:** a snapshot with zero creatures (soup wiped by the reaper) must restore
  to an engine that `run`s without error and produces an identical (empty-population) digest.
- **Injection at boundary cycles:** an injection with `atCycle == desc.cycles` is applied
  before `replay` returns, so a descriptor's final digest includes it (deterministic ordering
  vs. the run-to-end). Off-by-one here is a classic replay/live divergence — INV-REPLAY covers
  it (SNAP-003).
- **Version gate is fail-closed:** a mismatched `engineVersion` throws (`VersionMismatchError`)
  rather than attempting a best-effort restore (SNAP-005). This is an off-path programmer/
  data-versioning error, not a hot-path `raiseE`.
- **Digest stability across processes:** the same seed must yield the same digest on a fresh
  process, a different OS, and a different JS engine (integer-only checksum + integer-only RNG
  = cross-engine parity). SNAP-006 asserts run-to-run digest stability.

### Cross-cutting invariants owned here (how each is tested)

- **INV-DET** *(two engines, same RunDescriptor → identical snapshots at every checkpoint)* —
  Build two fresh engines from the same `RunDescriptor`. Run both to a series of checkpoint
  cycles `[C1, C2, …]`; at each, call `snapshot()` on both and assert the two `Snapshot`s are
  deeply equal (engineVersion, cycles, nextId, `rngState` 4 words, soup bytes, and the ordered
  `creatures[]` with all CPU/daughter/queue/bookkeeping fields). Any divergence at any
  checkpoint fails. Test: **SNAP-004**.
- **INV-REPLAY** *(`Engine.replay(desc)` digest == live-run digest)* — Construct a
  `RunDescriptor`; produce a *live* run by manually building an engine, injecting the same
  genomes at the same cycles, and running to `desc.cycles`, sampling `digest()` at checkpoints.
  Produce a *replayed* run via `Engine.replay(desc)`, sampling at the same checkpoints. Assert
  the two `RunDigest` sequences are equal element-for-element. Test: **SNAP-003**.
- **INV-ROUNDTRIP** *(`restore(snapshot(e))` continues bit-identically)* — Run engine `e` to
  cycle N. Take `snap = e.snapshot()`; build `e2 = Engine.restore(snap)`. Run both `e` and
  `e2` a further M cycles. Assert their `digest()` sequences over those M cycles are identical
  (and, for a strong form, that `e.snapshot()` == `e2.snapshot()` at the end). Includes
  mid-reproduction creatures and mid-rejection RNG state. Tests: **SNAP-002** (continuation)
  and **SNAP-001** (the RNG-state precondition it rests on).

---

## 7. Fidelity notes

- **[CORE] Full-state checkpoint + exact resume.** Tierra's `soup_out`/`core_out` freeze the
  entire machine — the whole `soup`, the IP state `is`, the RNG array `TrandArray[98]`, the
  reaper-queue indices, every cell's CPU/daughter/thread data, the `FreeMemry` free-block
  list, and the template list — and `ReadDynMem` reloads them so a run **resumes exactly**
  (`docs/original-tierra/07-ancestor-and-formats.md` §"`soup_out` / `core_out`";
  `tsetup.c:4116`, `4195`). Our `Snapshot` preserves this property exactly: freeze everything
  needed to continue, restore, and continue bit-identically. This is *the* reproducibility
  contract of the engine, so it is [CORE].
- **[MOD] One RNG word-set, not a 98-slot array.** Tierra serializes `TrandArray[98]` (its
  `ran1`-family shuffle table). We serialize the **4 xoshiro128\*\* words** (01-determinism
  §3). *Why:* we modernized the generator itself; the fidelity property preserved is "the RNG
  resumes with zero drift", not the specific table shape.
- **[MOD] `RunDescriptor` replaces `soup_in` + inoculation list.** Tierra reproduces a run by
  re-reading `soup_in` (parameters) and its trailing inoculation list of genotype names
  (`docs/original-tierra/07` §`soup_in`). Our `RunDescriptor` is the same idea as first-class
  typed data: `{engineVersion, scenario, seed, injections[], cycles}` — a self-contained,
  shareable recipe. *Why:* first-class descriptors are testable (INV-REPLAY) and shareable
  (later Versus matches) without a filesystem of parameter files.
- **[MOD] Explicit `engineVersion` gate.** Tierra's `format:`/back-compat handling is ad hoc
  (`docs/original-tierra/07` §`.tie`, `format: 3` "now defunct"). We make version an explicit,
  fail-closed gate on restore/replay. *Why:* determinism is only defined within a version;
  silently replaying across versions would produce plausible-but-wrong trajectories.
- **[MOD] Digest for goldens.** Tierra compares runs by re-running and inspecting `.gen`
  banks / stats output. We freeze a compact integer `RunDigest` (population, genotypes,
  births, deaths, soup checksum) per checkpoint. *Why:* a tiny diff-able fingerprint makes
  regression detection loud and cheap; full snapshots remain available for deep debugging.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[SNAP-NNN] …')` in
`packages/engine/test/14-snapshot.test.ts`. IDs are append-only.

- **SNAP-001** Snapshot captures RNG state exactly: `snapshot(e).rngState` is a length-4
  `Uint32Array` deep-equal to `e`'s live `rng.state()`, sharing no buffer; restoring it and
  drawing reproduces the original engine's next `next()`/`int(n)` sequence (the precondition
  INV-ROUNDTRIP rests on).
- **SNAP-002** Restore continues bit-identically for N cycles **(INV-ROUNDTRIP)**: run `e` to
  cycle K, `e2 = restore(snapshot(e))`; running both a further M cycles yields identical
  `digest()` sequences (and identical final snapshots), including any mid-reproduction
  creatures (daughter fields/mask) and mid-rejection RNG state.
- **SNAP-003** Replay digest equals live-run digest **(INV-REPLAY)**: for a `RunDescriptor`
  `desc`, `Engine.replay(desc)` produces the same `RunDigest` sequence at every checkpoint as a
  manually-built live run that injects the same genomes at the same cycles and runs to
  `desc.cycles` (including boundary-cycle injections).
- **SNAP-004** Two engines, same descriptor → identical snapshots at each checkpoint
  **(INV-DET)**: two fresh engines built from one `RunDescriptor`, run to a shared checkpoint
  list, produce deep-equal `Snapshot`s at every checkpoint (engineVersion, cycles, nextId,
  rngState, soup bytes, and the ordered `creatures[]` with all CPU/daughter/queue/bookkeeping
  fields).
- **SNAP-005** `engineVersion` mismatch is detected on restore: `restore`/`Engine.restore`
  (and `Engine.replay`) throw `VersionMismatchError` when the `Snapshot`/`RunDescriptor`
  `engineVersion` differs from the running `ENGINE_VERSION`; a matching version restores
  successfully.
- **SNAP-006** Digest is stable across runs with the same seed: two independent runs from the
  same `RunDescriptor` (or same scenario seed + injections) yield identical `RunDigest`s at the
  same cycle N — including a fresh-process / repeated invocation (integer-only checksum + RNG
  ⇒ no drift).
- **SNAP-007** Snapshot is a reference-free, independent copy: `snapshot(e)` shares no backing
  buffer with `e` (mutating the live engine after snapshotting does not alter the snapshot, and
  a restored engine does not alias the snapshot's soup/CPU arrays).
- **SNAP-008** Snapshot completeness (C-SNAP tripwire): a snapshot serializes every mutable
  `World`/creature field enumerated in §3 — `engineVersion, scenario, cycles, nextId, rngState
  (4 words), soup bytes, births, deaths`, and per creature `bounds + full CPU (reg/ip/stack/sp/
  flags) + daughter fields (dauStart/dauSize/dauWritten/dauWriteMask) + queue positions
  (slicerPos/reaperPos) + bookkeeping (bornAtCycle/parentId/errorCount) + genotypeId`; a
  round-trip preserves all of them.
- **SNAP-009** Restore reconstructs queue membership (INV-QUEUE): after `restore`, every live
  creature occupies exactly one slicer position and one reaper position, relinked from the
  stored `slicerPos`/`reaperPos`, and dead creatures appear in neither.
- **SNAP-010** Creatures are captured in deterministic (slicer-queue) order, not map order:
  the `creatures[]` array order is a function of the slicer queue, so structurally-equal worlds
  serialize identically (guards the INV-DET foundation against hash-order regressions).

---

## 9. Open questions

1. **Snapshot wire format.** In-memory structured-clone only, or also a stable serialized form
   (JSON with base64 typed arrays, or a binary framing)? Propose: in-memory `Snapshot` object
   for M0 tests; defer an on-disk/wire format (and its own version tag) until sharing lands.
2. **`engineVersion` matching policy (SNAP-005).** Exact-match only in M0. Do we ever want a
   compatibility range (e.g. "restorable within a minor series")? Propose: exact-match now,
   revisit with a documented compat table when the ISA/slicer stabilizes.
3. **Digest checkpoint schedule.** Fixed cadence (every K cycles), caller-supplied checkpoint
   list, or both? Propose: caller-supplied list for property tests; a default cadence for
   golden fixtures. Must be identical across the two runs being compared.
4. **`soupChecksum` algorithm lock-in.** FNV-1a/uint32 proposed (matches the genebank hash
   family). Confirm the exact constants and that the whole soup (not just occupied cells) is
   hashed, so freed-cell residue is part of the fingerprint.
5. **Speculative-run clone vs. snapshot/restore.** `world.clone()` (via `rng.clone()`) is a
   cheaper in-process fork than `restore(snapshot())`. Should INV-ROUNDTRIP also assert
   `clone()` ≡ `restore(snapshot())`, or keep clone as a separate (scheduler/world) concern?
