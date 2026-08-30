# Engine Systems — Architecture & Interconnections

**Status:** v1, anchor doc. Defines the engine's **system map**, the **cross-cutting
contracts** every system obeys, the **glossary**, the **criterion-ID scheme** that ties docs
to tests, and the **authoring conventions** for the rest of this folder. Every other
`systems/NN-*.md` doc conforms to the template here.

Upstream: [`SPEC.md`](../../SPEC.md) (product+engineering), [`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md)
(the VM & 32-op ISA), [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) (the build blueprint).
Reference: [`docs/original-tierra/`](../../../original-tierra/00-README.md).

---

## 1. What the engine is

A pure, deterministic, headless virtual machine: a **soup** (shared byte memory) in which
**creatures** (self-replicating programs) execute on per-creature **CPUs**, scheduled by a
**slicer**, culled by a **reaper**, varied by **mutation**, and tracked by a **genebank**.
No DOM, no I/O, no wall-clock. The whole thing is a function of `(scenario, seed, injected
genomes, cycles)`.

Design commitments (from the specs): classic **32-op ISA**; **integer-only determinism**;
one **seeded PRNG**; **write-protection** as the parasite niche; **preserve dynamics,
modernize implementation**.

---

## 2. System map

```
                         ┌─────────────────────────────────────────────┐
                         │                  World                        │
                         │  (owns state + drives the tick loop)          │
                         │  soup · creatures · queues · rng · cycles     │
                         └───────────────┬───────────────┬──────────────┘
             drives                       │               │            observes
   ┌──────────────────────┐              │               │      ┌──────────────────────┐
   │ Scheduler (slicer)    │  picks next  │               │ hooks│ Statistics (M1)       │
   │ [09]                  │──────────────┘               └──────│ [13]                  │
   └──────────┬───────────┘                                      └──────────────────────┘
              │ runs a slice of                                   birth/death events
              ▼
   ┌──────────────────────┐   fetch   ┌───────────────┐  decode  ┌──────────────────────┐
   │ CPU / exec cycle [07] │──────────▶│ Instr set [04] │────────▶│ Decode & operands [05]│
   └──────────┬───────────┘           └───────────────┘          └──────────┬───────────┘
              │ execute handler                                              │ template ops
              ▼                                                              ▼
   ┌──────────────────────┐        ┌──────────────────────┐      ┌──────────────────────┐
   │ Soup + protection [02]│◀──────▶│ Reproduction [08]     │      │ Template search [06] │
   └──────────┬───────────┘  write  │ (mal/copy/divide)     │      └──────────────────────┘
              │ alloc/free           └──────────┬───────────┘
              ▼                                  │ divide → new creature
   ┌──────────────────────┐                      ▼
   │ Allocator [03]        │        ┌──────────────────────┐   full/ error   ┌───────────────┐
   │ (free intervals)      │◀──────▶│ Reaper / death [10]   │◀───────────────▶│ genebank [12] │
   └──────────────────────┘  reap   └──────────────────────┘  birth/death    └───────────────┘

  cross-cutting: Determinism & RNG [01] · Mutation [11] · Snapshot [14] · Engine API [15]
```

### Module dependency graph (compile-time `import` direction, no cycles)
```
rng ── (none)
types ── (none)
soup ──▶ types
alloc ──▶ soup, types
isa/dictionary ──▶ types                 (+ handlers, which take World at call time)
isa/set ──▶ dictionary, types
isa/decode ──▶ soup, isa/set, template, types
isa/handlers ──▶ soup, template, mutation, types      (World passed as arg, not imported)
template ──▶ soup, types
cpu ──▶ types
creature ──▶ cpu, types
scheduler ──▶ creature, rng
reaper ──▶ creature, alloc, genebank
mutation ──▶ rng, isa/set, soup
genebank ──▶ creature
world ──▶ everything above (the composition root)
snapshot ──▶ world
index (Engine API) ──▶ world, snapshot, config
```
**Rule:** systems depend *downward* only. `World` is the single composition root that wires
them and is passed into handlers as context. No system reaches back up to `World`'s owner.

---

## 3. The `World` context (the hub)

Nearly every operation takes a `World` reference. It holds the mutable state and the shared
scratch used on the hot path:

- `soup: Soup`, `rng: Rng`, `cycles: number`, `nextId`, `avgSize`, `searchLimit`
- `creatures` (id→Creature lookup), the **slicer queue** and **reaper queue** (ordered)
- `decoded: DecodeState` — **one reused struct** filled by decode, read by handlers (no
  per-instruction allocation)
- `mutation`, `genebank`, `stats` (M1)
- counters: `births`, `deaths`

Systems communicate through `World` + explicit arguments, never through globals. This is
what makes a `World` fully **snapshot-able** (§[14]) and **clonable** for speculative runs.

---

## 4. Data-flow walkthroughs (the interconnections in motion)

**One instruction** (`[07]` drives): read opcode at `IP` → map to `InstrId` via active set
`[04]` → `decode[kind]` fills `world.decoded`, possibly running a template search `[06]` and
reading soup `[02]` → `exec` handler `[04]` mutates CPU/soup (writes checked by protection
`[02]`, values optionally perturbed by `[11]`) → flags set → `IP` advanced (unless a jump set
it) → `cycles++`.

**One slice** (`[09]`): the slicer picks the next creature round-robin and runs
`sliceSize(creature)` instructions, stopping early if it dies. `World.run(n)` executes whole
slices until the instruction budget is met.

**A reproduction** (`[08]`): `mal` asks the allocator `[03]` for a daughter block (reaping
`[10]` if the soup is full), write-protected to the mother. The copy loop `movii`-writes the
daughter, tracked distinctly. `divide` (legal at ≥0.7 fill) creates a new creature, enqueues
it in slicer+reaper, fires the genebank `[12]` birth hook, and moves the mother *down* the
reaper queue.

**A death** (`[10]`): soup fullness (or an allocation) triggers killing the reaper-queue
head → free its cell(s) via `[03]` → fire the genebank death hook → unlink from both queues.

**An error** (`[01]`/`[07]`): any handler may `raiseE(creature)` (failed template, illegal
write, div-by-0, illegal divide, stack fault, alloc fail). Errors move the creature *up* the
reaper queue `[10]` — mistakes are selected against.

**Injection** (`[15]`): the Engine API places a genome at a free gap `[03]`, registers a
creature, assigns a genotype `[12]`, and enqueues it.

---

## 5. Cross-cutting contracts (every system MUST obey)

- **C-DET (determinism):** no floating point on any simulation path; no `Math.random`, no
  `Date.now`. All randomness via `world.rng` (§[01]) in a fixed call order. All ordered
  traversal via the slicer/reaper queues, never via `Map`/object key order.
- **C-ADDR (addressing):** every soup access goes through `ad(x) = ((x % S) + S) % S`
  (circular). No system indexes the soup raw.
- **C-PROT (protection):** reads/executes are unrestricted; every write is gated by
  `soup.canWrite(creature, addr)` (§[02]). Handlers must check before writing.
- **C-ERR (error protocol):** faults call `raiseE(creature)` (sets `flagE`, increments
  `errorCount`, moves up reaper). Faults never throw JS exceptions on the hot path.
- **C-ID (identity):** creature ids come from `world.nextId++` (monotonic, deterministic).
- **C-SNAP (snapshot-ability):** all simulation state lives in `World`/its members and is
  serializable; no hidden module-level mutable state.
- **C-INT (integer domain):** registers/soup/addresses/sizes are integers; register math is
  signed-32-bit wrap (`Int32Array` semantics).

### Global invariants (asserted by property tests, §[14]/§conventions)
- **INV-MEM:** occupied intervals never overlap; `Σ(cell sizes) + free == soupSize`.
- **INV-QUEUE:** every live creature is in exactly one slicer position and one reaper
  position; dead creatures in neither.
- **INV-DET:** two engines with the same `RunDescriptor` produce identical snapshots at every
  checkpoint.
- **INV-REPLAY:** `Engine.replay(desc)` digest == live-run digest.
- **INV-ROUNDTRIP:** `restore(snapshot(e))` continues bit-identically.
- **INV-TEMPLATE:** `nop0/nop1` are opcodes `0/1` in every active set; complement match uses
  `NopS==1`.

---

## 6. Glossary (canonical terms — use these exactly)

| Term | Meaning |
|---|---|
| **soup** | the shared `Uint8Array` address space; one byte = one instruction cell |
| **creature / cell** | a contiguous run of soup owned by one CPU; the organism |
| **daughter** | a block a creature has `mal`-allocated and is copying into |
| **genome** | the byte sequence of a creature (opcodes in the active set) |
| **genotype** | an equivalence class of identical genomes; has an id/label |
| **template** | a run of `nop0`/`nop1` used as an address by complementary match |
| **slice** | the run of instructions one creature gets per scheduler turn |
| **reaper** | the death queue; head dies when space is needed |
| **flaw** | ±1 operand/result perturbation at execution time (operational mutation) |
| **active set** | the `InstructionSet` a scenario enables (classic32 or a tutorial subset) |
| **InstrId** | canonical engine-wide instruction id (dispatch key); ≠ opcode byte |
| **opcode** | the byte value in a genome = index into the active set |
| **RunDescriptor** | `{engineVersion, scenario, seed, injections, cycles}` — full replay recipe |
| **cycle** | one executed instruction (the global clock unit) |

---

## 7. The document set (index)

Each system has one doc **and** one companion pending-test file
(`packages/engine/test/NN-<code>.test.ts`). Code = the criterion-ID prefix.

| # | Doc | Code | Responsibility | Milestone |
|---|---|---|---|---|
| 00 | this file | ARCH | system map, contracts, conventions | — |
| 01 | determinism-and-rng | RNG | PRNG algorithm, seeding, determinism contract | M0 |
| 02 | soup-and-memory | SOUP | address space, circular addressing, protection | M0 |
| 03 | allocator | ALLOC | free-interval mgmt, first-fit, reap-to-make-room | M0 |
| 04 | instruction-set-and-dispatch | ISA | dictionary, named set/subset, opcode↔id, handler table | M0 |
| 05 | decode-and-operands | DEC | operand resolution, register binding, DecodeState | M0 |
| 06 | template-addressing | TMPL | complementary search, limits, results | M0 |
| 07 | cpu-and-execution-cycle | CPU | registers/flags/stack, fetch-decode-execute, IP | M0 |
| 08 | creature-lifecycle-and-reproduction | REPRO | mal→copy→divide, daughter tracking, 0.7 gate | M0 |
| 09 | scheduler-slicer | SLICE | RanSlicerQueue, slice sizing, tick loop | M0 |
| 10 | reaper-death | REAP | death queue, up/down movement, kill, triggers | M0 |
| 11 | mutation-and-variation | MUT | flaw/copy/cosmic + divide-time operators | M1 |
| 12 | genotype-and-genebank | GENE | genotype id/label, lineage, in-mem + save policy | M1 |
| 13 | statistics-and-observation | STAT | population/genotype/size metrics, snapshots for UI | M1 |
| 14 | snapshot-and-reproducibility | SNAP | serialize/restore, RunDescriptor, replay, invariants | M0 |
| 15 | engine-api-and-scenarios | API | public API, Scenario config, inject, run, replay | M0 |

---

## 8. Authoring conventions

### 8.1 Doc template (every `NN-*.md` follows this)
```
# <System> — Engineering Spec              (Code: XXX · Milestone: M0/M1)
Status · upstream refs (ISA-VM-SPEC/M0/reference by file:line) · which contracts it obeys.

1. Purpose & responsibility        (1 paragraph: what it owns, what it must guarantee)
2. Interfaces                      (the TS types/functions it exposes; who imports it)
3. Data structures                 (fields, why, integer/units, invariants they hold)
4. Behavior / algorithms           (step-by-step; pseudocode for anything non-obvious)
5. Interconnections                (what it calls; what calls it; the contracts crossed)
6. Determinism & edge cases        (ordering, wrap, failure modes, C-* contracts applied)
7. Fidelity notes                  ([CORE]/[MOD]/[OPTIONAL] vs original Tierra, with why)
8. Acceptance criteria             (numbered XXX-001…; each maps to a test in the companion file)
9. Open questions
```

### 8.2 Criterion IDs
- Each acceptance criterion gets a stable id `CODE-NNN` (e.g. `SOUP-006`), listed in the
  doc §8 and referenced verbatim in the test name. IDs are **append-only** — never renumber.
- A criterion is testable and specific ("write outside own+daughter cell is denied and sets
  E"), not vague ("protection works").

### 8.3 Test conventions (`packages/engine/test/NN-<code>.test.ts`)
- Runner: **node:test** (built-in) via `npm test` (`node --experimental-strip-types --test`).
- Encode every criterion as a **pending test**: `it.todo('[CODE-NNN] <criterion>')`, grouped
  in a `describe('<System> (CODE)')`. Node reports these as `# todo` (not failures), so the
  suite is green-runnable pre-implementation and reads as a checklist.
- **Do NOT import engine `src/` modules yet** (they don't exist — an import error would fail
  the file). Bodies are added when the module lands: `it.todo(name)` → `it(name, () => {…})`.
- Naming = the criterion id + a plain-language assertion, ideally Given/When/Then in the id's
  text. One `it.todo` per criterion; keep 1:1 doc↔test.
- Cross-cutting invariants (INV-*) live in `14-snap.test.ts`/a `_invariants.test.ts`.
- `// FIXME:` / `// TODO:` comments may annotate a test with implementation hazards to
  remember (e.g. rejection-sampling bias, template merge).

### 8.4 Fidelity tags
`[CORE]` (preserve exactly), `[MOD]` (behavior kept, impl modernized — say why),
`[OPTIONAL]` (deferred/reference-only). Consistent with ISA-VM-SPEC §10.

---

## 9. How this unblocks implementation
The per-system docs + criterion tests form the contract. Implementation (M0 build order,
M0-TECH-DESIGN §17) proceeds system by system; a system is "done" when its `CODE-NNN` tests
flip from `todo` to passing and the global INV-* tests stay green. No implementation should
begin on a system whose doc §8 criteria aren't agreed.
