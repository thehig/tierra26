# tierra26 Engine — M0 Technical Design

**Status:** v1. The implementation blueprint for **M0 (headless deterministic engine core)**.
Turns [`ISA-VM-SPEC.md`](ISA-VM-SPEC.md) into a concrete module layout, data model,
algorithms, and test plan. Language: **TypeScript** (per `SPEC.md` §17). No DOM, no UI — a
pure, testable engine that runs headless and reproducibly.

**M0 done =** a hand-written ancestor breeds true under the scheduler + reaper, the soup
saturates, and a suite of **golden-run tests** locks the behavior — all bit-reproducible
from a seed.

---

## 1. Goals & non-goals

**M0 goals**
- Deterministic virtual machine implementing the **classic 32-op ISA** (§ISA-VM-SPEC §3.3).
- Soup with circular addressing and **write-protection** (read/execute global, write local).
- **Template addressing** (complementary match).
- **`mal` → copy → `divide`** life-cycle with the 0.7 fill gate.
- **Slicer** (RanSlicerQueue) + **reaper** (age/error queue) population dynamics.
- One **seeded PRNG**; a run reproducible from `(engineVersion, scenario, seed, genomes,
  cycles)`.
- A headless **Engine API** and a **golden-run test harness**.

**Deferred to M1+ (but the seams are built now)**
- Mutation / flaw / cosmic-ray (interfaces present, rates default 0 in M0).
- Genotype labelling + genebank (a hook on birth/death; full impl M1).
- Statistics aggregation, histograms, observation snapshots for UI (M1).
- Web-Worker wrapper + message protocol (M2 UI; the Engine API is designed worker-ready).

**Non-goals (M0):** any UI, any rendering, GeneScript compiler, networking, threads/toggles.

---

## 2. Architecture & module layout

A standalone engine package with **zero runtime dependencies** and no browser globals.

```
packages/
  engine/
    src/
      index.ts            // public Engine API surface
      config.ts           // Scenario/EngineConfig types + defaults + validation
      rng.ts              // deterministic PRNG (xoshiro128** + splitmix32 seeding)
      soup.ts             // Soup: Uint8Array + circular addressing + protection checks
      isa/
        dictionary.ts     // the instruction dictionary (canonical InstrId + metadata)
        classic32.ts      // the classic-32 named set: opcode order + register bindings
        set.ts            // InstructionSet: opcode<->InstrId, bit width, mask/subset
        handlers.ts       // one execute handler per InstrId (the semantics)
        decode.ts         // operand + template decoding into the shared DecodeState
      cpu.ts              // Cpu state (registers/IP/stack/flags) + step()
      creature.ts         // Creature: cell bounds, cpu, daughter tracking, queue links
      template.ts         // complementary-template search (ctemplate)
      alloc.ts            // deterministic first-fit allocator over free intervals
      scheduler.ts        // slicer: RanSlicerQueue + slice sizing
      reaper.ts           // reaper queue: insert/move/kill
      world.ts            // World: soup + creatures + queues + tick loop (the engine core)
      mutation.ts         // flaw/copy/cosmic hooks (M0: rate 0), single PRNG source
      genebank.ts         // genotype hook (M0: id only; M1: full bank)
      snapshot.ts         // serialize/deserialize World (reproducibility + tests)
      types.ts            // shared enums/branded types
    test/
      golden/             // frozen (scenario+seed -> outcome) fixtures
      *.test.ts
```

**Boundary rule:** everything under `engine/src` is pure and synchronous. The future Worker
(M2) `import`s the same module; determinism is a property of the module, not the host.

---

## 3. Determinism contract **[CORE]**

The single most important engine property. Rules:

1. **No floating point on any path a creature's fate depends on.** Slice sizing, allocation,
   template search, mutation, reaper ordering — all integer. (Presentation may use floats;
   the engine must not.)
2. **One PRNG instance** owned by `World`, seeded once from the scenario. Every stochastic
   draw goes through it, in a **fixed call order**. No `Math.random`, no `Date.now`.
3. **Deterministic iteration order** everywhere: creatures are processed in **slicer-queue
   order**, never by hash-map iteration. Any `Map` is used only for id→object lookup, never
   for ordered traversal.
4. **Stable ids:** creatures get a monotonically increasing `id` from a counter in `World`
   (not random, not address-based).
5. A run is fully described by a **RunDescriptor** `{ engineVersion, scenario, seed,
   injections[], cycles }` (§14) and replays bit-identically.

### PRNG (`rng.ts`)
- Algorithm: **xoshiro128\*\*** — four `uint32` state words, only rotate/xor/add/mul in
  32-bit space (no 64-bit multiply → identical across JS engines). Seeded by **splitmix32**
  expansion of the scenario seed.
- API:
  ```ts
  interface Rng {
    next(): number;              // uint32 in [0, 2^32)
    int(nExclusive: number): number;  // unbiased [0, n) via rejection
    float01(): number;           // [0,1) — NON-simulation use only (stats/UI)
    clone(): Rng;                // for snapshotting / speculative runs
    state(): Uint32Array;        // 4 words, for snapshot
    setState(s: Uint32Array): void;
  }
  ```
- `int()` uses rejection sampling for uniformity (never modulo-biased) — matters because
  mutation-site selection must be exactly reproducible and unbiased.

---

## 4. Core data model

```ts
// types.ts
type Addr = number;        // soup index (always taken mod soupSize on access)
type InstrId = number;     // canonical id into the dictionary (stable, engine-wide)
type Opcode = number;      // value stored in a genome byte (index into the active set)
type CreatureId = number;

// cpu.ts — 4 registers in the classic core (A..D). Signed 32-bit.
interface Cpu {
  reg: Int32Array;         // length 4 (A=0,B=1,C=2,D=3)
  ip: Addr;
  stack: Int32Array;       // length 10
  sp: number;              // 0..10
  flagE: boolean;          // error
  flagS: boolean;          // sign
  flagZ: boolean;          // zero
}

// creature.ts
interface Creature {
  id: CreatureId;
  start: Addr; size: number;        // the mother cell [start, start+size)
  cpu: Cpu;
  // daughter tracking (mal..divide):
  dauStart: Addr; dauSize: number;  // -1 size 0 when none
  dauWritten: number;               // count of distinct daughter bytes written (for 0.7 gate)
  dauWriteMask?: Uint8Array;        // 1 bit/ byte written, to count distinct writes
  // bookkeeping:
  bornAtCycle: number; parentId: CreatureId;
  errorCount: number;               // lifetime E events (reaper input)
  genotypeId: number;               // assigned at birth (genebank hook)
  // intrusive queue links (see scheduler/reaper): slicerPrev/Next, reaperPrev/Next
}
```

- **Registers as `Int32Array`** give exact 32-bit signed wrap for free (`| 0` semantics via
  typed array store). All arithmetic handlers write back through the array.
- **`dauWriteMask`** counts *distinct* daughter bytes written so the `divide` gate
  (`dauWritten / dauSize >= MovPropThrDiv`) can't be cheated by rewriting one byte
  (matches Tierra's intent; `04-population-dynamics.md` §Reproduction).

---

## 5. Instruction-set representation

Two levels (per ISA-VM-SPEC §3.1):

```ts
// isa/dictionary.ts — canonical, engine-wide
interface DictEntry {
  id: InstrId;               // stable
  mnemonic: string;          // "movii"
  gene: string;              // provisional GeneScript name "copy-byte"
  kind: DecodeKind;          // how to decode operands (enum)
  exec: (w: World, c: Creature) => void;   // from handlers.ts
  role: InstrRole;           // nop|arith|bitwise|stack|move|addr|jump|cond|repro
}

// isa/set.ts — a named/active set (the classic 32, or a tutorial subset of it)
interface InstructionSet {
  name: string;                    // "classic32" | "tutorial-ch3" ...
  opcodeToId: Int16Array;          // [0..N) -> InstrId
  binding: Uint8Array[];           // per opcode: fixed register letters -> indices
  n: number;                       // set size
  bitWidth: number;                // ceil(log2 n) — mutation domain
  nop0: Opcode; nop1: Opcode;      // must be 0/1
}
```

- **Dispatch is on `InstrId`** (dictionary), not on the raw opcode — so the same handler
  serves whatever set/subset maps to it. The active set only decides opcode↔id and register
  bindings.
- **Subsets** (tutorials) are just a smaller `InstructionSet` over the same dictionary; the
  engine is agnostic. Genomes are always bytes indexing the active set.
- **Mutation domain** = `bitWidth` low bits, value `mod n` (always valid) — set on the set,
  used by `mutation.ts`.

### Handlers (`isa/handlers.ts`)
One function per `InstrId`. They read decoded operands from a shared `DecodeState` (filled by
`decode.ts`) and mutate `Cpu`/soup. Example shape:

```ts
function exec_movii(w: World, c: Creature) {           // soup[dst] = soup[src]
  const { dstAddr, srcAddr } = w.decoded;              // from pmovii decode
  const v = w.soup.read(srcAddr);                      // read: global-permitted
  if (!w.soup.canWrite(c, dstAddr)) { raiseE(c); return; }
  const b = w.mutation.maybeCopyFlaw(v);               // M0: identity (rate 0)
  w.soup.write(dstAddr, b);
  c.markDaughterWrite(dstAddr);                        // updates dauWriteMask/dauWritten
}
```

Handlers never advance the IP; the step loop does (§6), except jump/call/ret which set
`cpu.ip` and signal "no auto-advance" via `w.decoded.iip = 0`/explicit flag.

---

## 6. Execution: fetch–decode–execute (`cpu.ts`, `world.ts`)

```
stepOne(world, creature):
  cpu = creature.cpu
  opcode = soup[cpu.ip mod S]
  id     = activeSet.opcodeToId[opcode]           // opcode -> canonical instr
  entry  = dictionary[id]
  world.decoded.reset(); world.decoded.iip = 1     // default advance
  decode[entry.kind](world, creature, entry)       // fills operands + maybe template scan
  entry.exec(world, creature)                      // performs the op
  applyFlags(cpu)                                  // S/Z where the op defined them
  if not world.decoded.ipWasSet:
      cpu.ip = (cpu.ip + world.decoded.iip) mod S
  world.cycles += 1
```

- `world.decoded` is a **single reused struct** (`DecodeState`) — no per-instruction
  allocation (hot path). It holds `sval/sval2/sval3`, `dstReg`, `dstAddr/srcAddr`, `iip`,
  `ipWasSet`, template results.
- **`flaw` in M0** = identity (rate 0). In M1, `decode` routes operand reads through
  `mutation.maybeFlaw()`.

---

## 7. Template addressing (`template.ts`) **[CORE]**

Implements ISA-VM-SPEC §5 exactly.

```
search(world, srcTplAddr, size, dir):   // dir ∈ {out, fwd, bwd}
  limit = world.searchLimit              // = SearchLimit(5.0) * avgSize, integer floor
  for l in 1..limit:
     if dir includes fwd: test position (srcAfter + l)
     if dir includes bwd: test position (srcBefore - l)
     match(pos): for i in 0..size-1:  soup[srcTpl+i] + soup[pos+i] == NopS(1) ?
     on match: return { addr: ad(pos + size), dist: l }   // land PAST the template
  return MISS
```

- All addresses via `ad(x) = ((x % S) + S) % S` (circular).
- Complement test uses `nop0=0, nop1=1, NopS=1` (values are opcodes in the active set;
  §8 guarantees nop0/nop1 = 0/1).
- **Decode side** (`decadr`/`decjmp`) measures the template length after `ip+1`, computes
  fwd/bwd start points, sets `iip = size + 1`, picks direction from the mnemonic.
- **Results:** `adr*` → `A := addr, C := size` (+ dist to 3rd reg if bound); `jmp*` →
  `cpu.ip = addr` (+ `ipWasSet=true`); `call` → also `push(returnAddr)`.
- **Miss** → `raiseE(creature)`, IP advances past own template, dest regs unchanged.
- `avgSize` is maintained by `World` (running mean of live creature sizes), recomputed on a
  cheap cadence; **must be integer** and updated deterministically.

---

## 8. Soup & allocator

### Soup (`soup.ts`)
```ts
class Soup {
  bytes: Uint8Array;               // length S
  read(a: Addr): Opcode            // ad(a)
  write(a: Addr, v: Opcode): void  // ad(a); caller checks protection
  canWrite(c: Creature, a: Addr): boolean   // in [start,start+size) OR daughter block
}
```
- **Protection** (`canWrite`) is the parasite niche (ISA-VM-SPEC §2.3). Reads/execs never
  checked; writes always checked at the handler.

### Allocator (`alloc.ts`) — deterministic first-fit **[MOD]**
- Maintains a **sorted list of occupied intervals** (by start). `findFree(size)` scans gaps
  left→right, returns the first gap ≥ size, else −1 (Tierra ships 6 `MalMode`s; we ship
  first-fit as default with the strategy behind an interface for later).
- On `mal`: free any prior undivided daughter, find room; if none and soup is full, ask the
  **reaper** to kill until room or empty (bounded), then allocate. Insert interval; record
  `dauStart/dauSize`, reset `dauWriteMask`.
- **Determinism:** gap scan is ordered; reap-to-make-room uses the reaper's ordered queue.
  No randomness unless a strategy explicitly draws from `world.rng`.

---

## 9. Scheduler / slicer (`scheduler.ts`) **[CORE]**

Ref `04-population-dynamics.md` §Slicer. Default **RanSlicerQueue**.

- Living creatures form a **circular intrusive doubly-linked list** (slicer queue) in birth
  order; new creatures append at the tail; the loop advances a cursor round-robin.
- **One slice** for creature `c`: run `sliceSize(c)` instructions (breaking early if `c`
  dies).
  - `sliceSize(c)`: with `SizDepSlice=1, SlicePow=1` → base `= c.size`; **RanSlicerQueue**
    randomizes to `rng.int(2 * base + 1)` (uniform in `[0, 2·size]`). Integer.
- **Tick model:** `World.run(nInstructions)` executes whole slices until the instruction
  budget is met or the population is empty. `World.step()` = one instruction (for debugging /
  golden step tests).
- Larger genomes get proportionally more CPU → size is **not** automatically selected against
  (preserves Tierran dynamics).

---

## 10. Reaper (`reaper.ts`) **[CORE]**

Ref `04-population-dynamics.md` §Reaper.

- A **doubly-linked queue**, head = next to die. New creatures enter at the **tail**
  (youngest). The soup filling past a threshold (or an allocation needing room) kills the
  **head**.
- **Movement:** an `E`-flag event calls `moveUp(c)` (toward head/death); a successful
  `divide` calls `moveDown(c)` (toward tail/safety). Movement is **one position** per event
  (Tierra's `UpReaper`/`DownReaper`), O(1) with intrusive links.
- `kill(c)`: free its cell (and any undivided daughter), unlink from both queues, fire the
  genebank death hook, bump `deaths`.
- **Determinism:** position changes are deterministic functions of execution order; no RNG in
  the base reaper (Tierra's `ReapRndProp` random-top option is a later toggle).

---

## 11. Reproduction bookkeeping (`world.ts` + handlers)

- **`mal`** (handler `exec_mal`): size from register `C`; validate `size ≥ MinCellSize(12)`
  and `≤ maxCellSize`; allocate (§8); set daughter fields; `A := dauStart`; on failure
  `raiseE`.
- **copy loop**: ordinary `movii` writes into the daughter; `markDaughterWrite` sets the bit
  and increments `dauWritten` only on **first** write to each byte.
- **`divide`** (handler `exec_divide`): legal iff `dauStart≥0` and
  `dauWritten / dauSize ≥ MovPropThrDiv(0.7)`; else `raiseE`. On success: create a new
  `Creature` over `[dauStart,dauSize)` with a fresh zeroed CPU (IP at its start), assign
  `id`, `parentId`, `bornAtCycle`; enqueue in slicer + reaper; fire genebank birth hook;
  `moveDown(mother)`; clear the mother's daughter fields; `births++`.

---

## 12. Mutation & flaw (`mutation.ts`) — seams in M0, live in M1

```ts
interface Mutation {
  maybeFlaw(x: number): number;         // ±1 at flaw rate (M0: returns x)
  maybeCopyFlaw(b: Opcode): Opcode;     // bit-flip at copy rate (M0: returns b)
  cosmicTick(soup: Soup, set: InstructionSet): void; // background flip (M0: no-op)
}
```
- Single source of randomness (`world.rng`), fixed call sites. In M0 all rates are 0, so the
  ancestor **breeds true** and golden runs are pure. M1 flips these on and adds the
  divide-time insertion/deletion/crossover operators (`05-genetics-genebank.md`).

---

## 13. Genotype / genebank hook (`genebank.ts`)

- M0: on birth, compute a **genome hash** (FNV-1a over the cell bytes) → `genotypeId`; track
  a minimal `{ id, hash, size, alive, everBorn }`. Enough for golden tests to assert "1
  genotype under sterile conditions."
- M1: full genebank — human labels (`0080aaa` scheme), lineage/parent, first-seen, sample
  bytes, save policy.

---

## 14. Engine API & reproducibility

```ts
// index.ts
interface Scenario {
  soupSize: number;              // default 60000
  instructionSet: 'classic32' | SubsetSpec;
  seed: number;
  slicer: { style: 'ran'; sizeDependent: true; slicePow: 1 };
  reaper: { threshold: number };     // soup-fullness trigger
  limits: { minCellSize: 12; searchLimitMult: 5; movPropThrDiv: 0.7; ... };
  mutation: { flaw: 0; copy: 0; cosmic: 0 };   // M0 defaults
}
interface Injection { atCycle: number; genome: Uint8Array; }
interface RunDescriptor { engineVersion: string; scenario: Scenario; injections: Injection[]; cycles: number; }

class Engine {
  constructor(scenario: Scenario);
  inject(genome: Uint8Array): CreatureId;   // place at first free gap; register
  step(): void;                             // one instruction
  run(nInstructions: number): void;         // whole slices to budget
  get cycles(): number;
  stats(): { population: number; genotypes: number; births: number; deaths: number; fullness: number };
  snapshot(): Snapshot;                     // full deterministic state (§15)
  static restore(s: Snapshot): Engine;
  static replay(desc: RunDescriptor): Engine; // fresh -> inject -> run; must equal live run
}
```

- **`replay(desc)`** is the reproducibility contract and the backbone of golden tests and
  (later) Versus match sharing.

## 15. Snapshot / serialization (`snapshot.ts`)
- Serializes: engine version, scenario, `cycles`, `nextId`, **RNG state (4 words)**, soup
  bytes, and every creature (bounds, full CPU, daughter fields, queue positions, bookkeeping).
- `restore` reconstructs an engine that continues **bit-identically**. Round-trip
  (`restore(snapshot(e))` ≡ `e`) is a tested invariant.

---

## 16. Test plan **[CORE deliverable of M0]**

Fixes the prior build's thin coverage. Four layers:

1. **Unit tests** — per subsystem:
   - PRNG: known-seed → known first-K outputs; `int(n)` uniformity/no-bias; clone/state
     round-trip.
   - Template search: hand-built soups with known complements fwd/bwd/out; miss past limit;
     wrap-around; adjacent-template edge.
   - Allocator: gap-finding, reap-to-make-room, free-on-death, interval integrity.
   - Protection: write inside/outside cell + daughter; parasite read of foreign code allowed.
   - Each handler: table-driven (register in → register/flag/soup out).
2. **Ancestor integration tests** (the M0 acceptance gate):
   - Assemble the classic **80-instruction ancestor** (`0080aaa`, from
     `07-ancestor-and-formats.md`); with **mutation off**: `births > K`, and **exactly 1
     genotype** (breeds true); soup **saturates**; reaper produces deaths.
   - `divide` illegally-early attempt sets `E` and does not reproduce.
3. **Golden-run fixtures** (`test/golden/`) — freeze `(scenario+seed) → outcome digest`
   (population, genotype count, births/deaths, a soup checksum at cycle N) for several seeds.
   Any engine change that alters trajectories fails loudly. Regenerated only on intentional
   behavior changes (reviewed).
4. **Property/invariant tests**:
   - **Determinism:** two fresh engines, same descriptor → identical snapshots at every
     checkpoint.
   - **Replay:** `Engine.replay(desc)` digest ≡ live-run digest.
   - **Snapshot round-trip:** `restore(snapshot(e))` continues identically for M cycles.
   - **Conservation:** occupied intervals never overlap; `sum(sizes)+free == soupSize`;
     every live creature is in exactly one slicer and one reaper position.

Test runner: node's built-in test runner + `tsx`/`--experimental-strip-types` (keep it
dependency-light, like the current `npm test`).

---

## 17. M0 build order (incremental, each step testable)

1. `rng.ts` (+ tests) — determinism foundation first.
2. `types.ts`, `soup.ts` (+ protection tests).
3. `isa/`: dictionary + classic32 set + decode + handlers (+ per-handler tests). Start with
   arithmetic/stack/move; add addr/jump; add mal/divide last.
4. `template.ts` (+ search tests).
5. `alloc.ts` (+ allocator tests).
6. `cpu.ts` + `world.ts` step loop (+ single-step golden).
7. `scheduler.ts` + `reaper.ts` (+ population tests).
8. `creature.ts` daughter tracking + reproduction wiring.
9. `genebank.ts` minimal hook + `mutation.ts` no-op seams.
10. `snapshot.ts` (+ round-trip test).
11. Assemble ancestor → **acceptance tests** → freeze **golden fixtures**.
12. `index.ts` Engine API + `replay`.

**Exit criterion:** ancestor breeds true, soup saturates, all four test layers green, and a
RunDescriptor replays bit-identically.

---

## 18. Open questions

1. **Ancestor source for M0.** Use the authentic `0080aaa` (80 instr, classic set) verbatim
   as the golden creature? (Recommended — it's the canonical breeds-true reference.) We hand-
   assemble it from `07-ancestor-and-formats.md`.
2. **`avgSize` update cadence** — every reproduction event, or every N cycles? (Must be
   deterministic; affects `searchLimit`.) Propose: recompute on each birth/death.
3. **Reaper trigger** — purely soup-fullness threshold, or also on every `mal` that needs
   room? Tierra does both; propose both, threshold configurable.
4. **Repo placement** — new `packages/engine/` alongside a later `packages/web/`, replacing
   the disposable current build. Confirm monorepo layout (or single package for now).
5. **Node test runner vs vitest** — keep zero-dep node runner (matches current), or adopt
   vitest for ergonomics? Lean zero-dep for the engine package.
