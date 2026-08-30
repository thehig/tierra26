# Creature Lifecycle & Reproduction — Engineering Spec              (Code: REPRO · Milestone: M0)

**Status:** v1. The system that turns a running creature into two: allocate a daughter
(`mal`), copy the genome into it (the `movii` loop), and cut it loose as an independent,
scheduled creature (`divide`) once the 0.7 fill gate is met.

**Upstream refs:**
[`ISA-VM-SPEC.md`](../../ISA-VM-SPEC.md) §4.9 (`mal`/`divide` semantics), §6 (the
reproduction life-cycle at the ISA level), §9 (constants: `MinCellSize=12`,
`MovPropThrDiv=0.7`).
[`M0-TECH-DESIGN.md`](../../M0-TECH-DESIGN.md) §4 (`Creature` type incl. `dauWriteMask`),
§5 (handler shape, `markDaughterWrite`), §8 (allocator), §11 (reproduction bookkeeping).
Reference: [`04-population-dynamics.md`](../../../original-tierra/04-population-dynamics.md)
§4 (Reproduction Life-Cycle: `malchm`, copy loop `mov_daught`/`MovOff*`, `divide` gated by
`MovPropThrDiv`, `DivideBookeep`, `DownReperIf`),
[`07-ancestor-and-formats.md`](../../../original-tierra/07-ancestor-and-formats.md) (the
canonical `0080aaa` self-replication loop).

**Contracts obeyed:** C-ADDR (all daughter/soup access via `ad(x)`), C-PROT (every `movii`
write into the daughter is gated by `soup.canWrite`), C-ERR (`mal`/`divide` faults call
`raiseE`, never throw), C-ID (daughter id from `world.nextId++`), C-INT (sizes/counts are
integers; the 0.7 gate is evaluated with integer cross-multiplication, no float),
C-DET (no RNG in the base `mal`/`divide` path in M0; ordered queue enqueue), C-SNAP (all
daughter state lives on `Creature` and is serializable).

---

## 1. Purpose & responsibility

This system owns the **birth half** of the population dynamics: the three-phase life-cycle
`mal → copy loop → divide` and the per-creature **daughter bookkeeping** that makes it
legal. It guarantees that (a) a daughter block is allocated write-protected to exactly its
mother, (b) only *distinct* daughter bytes count toward the fill gate so rewriting one byte
cannot cheat divide, (c) `divide` is legal **iff** the daughter is allocated and ≥ 70%
(`MovPropThrDiv`) filled, and (d) a legal `divide` produces a fully independent creature —
fresh zeroed CPU, its own id/parent/birth-cycle, enqueued in **both** the slicer and reaper
queues, with the genebank birth hook fired and the mother moved *down* the reaper (rewarded
for reproducing). Copying and the 0.7 gate are **[CORE]** Tierran mechanics preserved
exactly; the allocator strategy behind `mal` is **[MOD]** (first-fit; §7).

---

## 2. Interfaces

Reproduction is not a standalone module: it is the `mal`/`divide` **handlers**
(`isa/handlers.ts`), the daughter fields + helpers on `Creature` (`creature.ts`), and a
small amount of wiring in `World` (`world.ts`). It imports downward only (soup, alloc,
scheduler, reaper, genebank, types); nothing imports it back.

```ts
// creature.ts — daughter tracking surface (see §3 for fields)
interface Creature {
  // ... identity/cell/cpu/bookkeeping (M0-TECH-DESIGN §4) ...
  dauStart: Addr;            // daughter block start; -1 when no daughter allocated
  dauSize: number;          // daughter block size in bytes; 0 when none
  dauWritten: number;       // count of DISTINCT daughter bytes written (0.7 gate numerator)
  dauWriteMask?: Uint8Array; // 1 flag/byte over [0,dauSize); set on first write to each byte

  markDaughterWrite(addr: Addr): void; // idempotent per byte: set mask bit + inc dauWritten
  clearDaughter(): void;               // dauStart=-1, dauSize=0, dauWritten=0, mask released
}

// isa/handlers.ts — the two reproduction handlers (dispatched by InstrId)
function exec_mal(w: World, c: Creature): void;      // size from reg C; A := dauStart
function exec_divide(w: World, c: Creature): void;   // 0.7 gate → new Creature | E

// world.ts — birth wiring invoked by exec_divide
interface World {
  birthDaughter(mother: Creature): Creature;  // create+register+enqueue+hook+moveDown+births++
}
```

**Who imports it:** the dictionary (`isa/dictionary.ts`) references `exec_mal`/`exec_divide`
as the `exec` for InstrIds 30/31; `World.step` (`[07]`) invokes them via the handler table.

---

## 3. Data structures

Daughter tracking lives entirely on `Creature` (M0-TECH-DESIGN §4). All fields are integers
or a typed array — snapshot-serializable, no hidden state.

| Field | Type | Units / domain | Why |
|---|---|---|---|
| `dauStart` | `Addr` | soup index, or `-1` | Start of the currently-allocated daughter block; `A` is set to this by `mal`. `-1` = **no daughter** (the only sentinel `divide` checks first). |
| `dauSize` | `number` | bytes, `0` when none | Block length. Also the **denominator** of the 0.7 gate and the size of the born creature's cell. Set by `mal`, cleared by `divide`/`kill`. |
| `dauWritten` | `number` | count `0..dauSize` | **Distinct** daughter bytes written so far = the gate **numerator**. Incremented only on the *first* write to each byte. |
| `dauWriteMask` | `Uint8Array?` | length `dauSize`, 1 flag/byte | The distinctness ledger. `markDaughterWrite` reads the flag; if unset, sets it and `dauWritten++`. Rewriting an already-written byte is a no-op for the counter — **this is what stops one byte cheating the gate** (M0-TECH-DESIGN §4; mirrors Tierra's `mov_daught`, `04-population-dynamics.md` §4b). |

Invariants held by this struct:
- **REPRO-INV-DAU:** `dauStart == -1` ⟺ `dauSize == 0` ⟺ `dauWritten == 0` ⟺ mask released.
  A creature has at most one live daughter at a time.
- **REPRO-INV-COUNT:** `0 ≤ dauWritten ≤ dauSize`; `dauWritten` equals the number of set
  bits in `dauWriteMask`.
- **REPRO-INV-PROT:** while `dauStart ≥ 0`, `[dauStart, dauStart+dauSize)` is a writable
  region for this mother in `soup.canWrite` (in addition to `[start, start+size)`), and for
  no other creature.

**[MOD] note.** Tierra tracks fill as `mov_daught` (count) plus the written span
`MovOffMin..MovOffMax`, and `divide` checks both count and span vs the threshold
(`04-population-dynamics.md` §4c). We collapse this to a single **distinct-byte count via a
bitmask**: it is a strictly tighter, simpler, still integer measure of "how much real work
built the daughter," and it removes the span/count double-book while preserving the intent
(you cannot divide until you have genuinely copied ≥ 70% of the daughter). Span-based fill is
`[OPTIONAL]` reference-only.

---

## 4. Behavior / algorithms

### 4.1 `mal` — allocate the daughter (handler `exec_mal`, InstrId 30, binding `A←C`)

Ref: ISA-VM-SPEC §4.9; `04-population-dynamics.md` §4a (`malchm`/`mal`);
M0-TECH-DESIGN §8, §11.

```
exec_mal(w, c):
  size = c.cpu.reg[C]                     // requested daughter size (integer, may be flawed in M1)
  if size < MinCellSize(12) or size > w.maxCellSize:
      raiseE(c); return                   // out-of-range request: E, no allocation, A unchanged
  # free any prior undivided daughter before requesting a new one (Tierra: mal frees ce->md first)
  if c.dauStart >= 0:
      w.alloc.free(c.dauStart, c.dauSize) // return the old block to free intervals [03]
      c.clearDaughter()
  addr = w.alloc.findFree(size)           // first-fit over free intervals [03]
  if addr < 0:
      addr = w.alloc.reapToMakeRoom(size) // reaper [10] kills queue-head cells until room/empty
  if addr < 0:
      raiseE(c); return                   // soup full, cannot make room: E (REAP_SOUP_FULL analogue)
  w.alloc.occupy(addr, size)              // insert the interval
  c.dauStart = addr; c.dauSize = size
  c.dauWritten = 0; c.dauWriteMask = new Uint8Array(size)  // fresh, all-unwritten
  c.cpu.reg[A] = addr                     // A := daughter start (the binding's result)
  # daughter is now write-protected to THIS mother via canWrite (§3 REPRO-INV-PROT)
```

Notes:
- `A` is written **only on success**. On any failure `raiseE(c)` sets `E`, moves the mother
  *up* the reaper (`[10]`, per C-ERR), and leaves registers untouched.
- Freeing the prior undivided daughter is unconditional when one exists: a second `mal`
  without an intervening `divide` **replaces** the daughter (the old block's bytes are
  abandoned to free memory; its fill count is discarded with `clearDaughter`).

### 4.2 The copy loop — ordinary `movii` writes, counted distinctly

Ref: ISA-VM-SPEC §6 step 3; `04-population-dynamics.md` §4b; M0-TECH-DESIGN §5.

There is **no special copy instruction path** in this system. The genome copies itself with
plain `movii` (`soup[A] := soup[B]`, InstrId 26), advancing pointers and `decC`-counting the
size, looping via `ifz`/`jmpo` (the `0080aaa` copy procedure, `07-ancestor-and-formats.md`).
Reproduction only participates through the write-side hook:

```
exec_movii(w, c):                          // [04] handler
  v   = w.soup.read(c.cpu.reg[B])          // read is global-permitted (C-PROT)
  dst = c.cpu.reg[A]
  if not w.soup.canWrite(c, dst): raiseE(c); return   // outside own+daughter → E, no write
  w.soup.write(dst, w.mutation.maybeCopyFlaw(v))       // M0: identity
  c.markDaughterWrite(dst)                  // ← the reproduction hook

markDaughterWrite(addr):                    // Creature method, idempotent per byte
  if dauStart < 0: return                   // not writing into a daughter (e.g. self-repair)
  off = ad(addr) - dauStart                 // offset within the daughter block
  if off < 0 or off >= dauSize: return      // wrote into own cell, not the daughter
  if dauWriteMask[off] == 0:
      dauWriteMask[off] = 1
      dauWritten += 1                        // count ONLY the first write to this byte
```

The key property: because the mask is checked before incrementing, **rewriting an
already-written daughter byte does not advance `dauWritten`** — a creature cannot spin one
`movii` on one address to reach the 0.7 gate without doing real copy work.

### 4.3 `divide` — cell fission (handler `exec_divide`, InstrId 31)

Ref: ISA-VM-SPEC §4.9, §6 step 4; `04-population-dynamics.md` §4c/§4d; M0-TECH-DESIGN §11.

```
exec_divide(w, c):
  # gate 1: a daughter must exist
  if c.dauStart < 0: raiseE(c); return
  # gate 2: distinct fill ≥ MovPropThrDiv (0.7) — evaluated in integers (C-INT), no float
  #   dauWritten / dauSize >= 0.7   ⟺   dauWritten * 10 >= dauSize * 7
  if c.dauWritten * 10 < c.dauSize * 7: raiseE(c); return
  # legal: hand the daughter its own life
  w.birthDaughter(c)

birthDaughter(mother):                       // world.ts
  child = new Creature()
  child.start = mother.dauStart; child.size = mother.dauSize   // owns [dauStart, dauSize)
  child.cpu = freshCpu()                     // zeroed regs A..D, empty stack, flags clear
  child.cpu.ip = child.start                 // IP at the daughter's OWN start
  child.id = world.nextId++                   // C-ID: monotonic, deterministic
  child.parentId = mother.id
  child.bornAtCycle = world.cycles
  child.dauStart = -1; child.dauSize = 0; child.dauWritten = 0  // child has no daughter yet
  world.creatures.set(child.id, child)
  scheduler.enqueue(child)                    // slicer [09]: append at tail (runs after peers)
  reaper.enqueueBottom(child)                 // reaper [10]: youngest = furthest from death
  genebank.onBirth(child, mother)             // [12] birth hook (genotypeId; M1 full bank)
  reaper.moveDown(mother)                     // reproduction pulls the mother AWAY from death
  mother.clearDaughter()                      // mother relinquishes the (now independent) block
  world.births += 1
  return child
```

Notes:
- The daughter's block is **transferred**, not freed: it was `occupy`d by `mal` and now
  belongs to `child` (the allocator interval stays; ownership moves from mother-daughter to
  the new creature). `INV-MEM` is preserved — no overlap, no leak.
- Fresh zeroed CPU with `ip = child.start` is what makes the daughter start executing its own
  genome from the top (it re-runs self-location → `mal` → copy → `divide`).
- On either gate failure: `raiseE(c)` (C-ERR) — `E` set, mother moved *up* the reaper,
  daughter fields **unchanged** (the mother may keep copying and retry `divide` later).

### 4.4 The canonical self-replication sequence

The whole system in one loop, as `0080aaa` implements it in `classic32`
(`07-ancestor-and-formats.md`, ISA-VM-SPEC §6):

1. **Locate self.** `adrb` + beginning-template complement → start into a register;
   `adrf` + end-template complement → end; `subCAB` → **size into `C`**.
2. **Allocate.** `mal` → daughter start into `A`, block write-protected to the mother (§4.1).
3. **Copy.** `call` the copy procedure: `movii` (`[A]←[B]`), `decC`, `ifz`/`jmpo` loop,
   advancing `A`/`B` until `C==0` — every byte counted once via `markDaughterWrite` (§4.2).
4. **Divide.** `divide` — legal once `dauWritten*10 ≥ dauSize*7`; daughter becomes an
   independent scheduled creature (§4.3); `jmpo` back to step 1 to breed again.

With mutation off (M0), the daughter is **byte-identical** to the mother and breeds true —
one genotype, sterile lineage.

---

## 5. Interconnections

**Calls (downward):**
- **Allocator `[03]`** — `mal` uses `findFree`/`occupy`/`free`; `reapToMakeRoom` on a full
  soup. `divide` transfers the interval's ownership (no alloc call).
- **Soup + protection `[02]`** — `markDaughterWrite` uses `ad()` (C-ADDR); `canWrite` grants
  the daughter region to the mother (C-PROT).
- **Reaper `[10]`** — `reapToMakeRoom` (kill head), `enqueueBottom(child)`,
  `moveDown(mother)`, and (via `raiseE`) `moveUp` on faults.
- **Scheduler `[09]`** — `enqueue(child)` appends the daughter to the slicer queue.
- **Genebank `[12]`** — `onBirth(child, mother)` assigns `genotypeId` (M0: FNV-1a hash;
  M1: full bank/lineage).
- **RNG `[01]`** — **not used** by base `mal`/`divide` in M0 (allocator is first-fit; no
  ejection). Kept RNG-free so the ancestor breeds true deterministically.

**Called by:** the CPU exec cycle `[07]` via the InstrId→handler table `[04]`. `divide`
sets no IP directly; the step loop advances IP past it as usual (the ancestor then `jmpo`s
back).

**Contracts crossed:** C-PROT (daughter writes), C-ERR (`raiseE` on both handlers), C-ID
(daughter id), C-INT (integer 0.7 gate), C-DET (ordered enqueue, no RNG), C-SNAP (state on
`Creature`).

---

## 6. Determinism & edge cases

- **Integer 0.7 gate.** Never `dauWritten / dauSize >= 0.7` in float (C-INT / determinism).
  Use `dauWritten * 10 >= dauSize * 7`. For `dauSize == 80`: threshold is 56 distinct bytes.
- **Ordering.** Daughter enqueue is by the queues' insertion rules (slicer tail, reaper
  bottom), never by map order (C-DET). Birth id from `nextId++` (C-ID).
- **Second `mal` frees the first daughter.** No leak, no double-occupancy (`04` §4a). The
  discarded fill count is reset with the block.
- **`divide` with no daughter** (`dauStart < 0`) → `E` (gate 1). **`divide` below 0.7** → `E`
  (gate 2). Neither mutates daughter state; the mother may retry.
- **`mal` below `MinCellSize` (12) or above `maxCellSize`** → `E`, no allocation.
- **Soup full.** `mal` reaps to make room; if still no room (population at floor) → `E`.
- **Write outside the daughter** during the copy loop → `movii` `raiseE` (C-PROT); the byte
  is not written and does not count.
- **Rewriting a daughter byte** → mask no-op; `dauWritten` unchanged (anti-cheat, §4.2).
- **Wrap.** Daughter offset uses `ad(addr) - dauStart`; a block may span the soup end — the
  mask indexes by offset, so wrap is handled at the address, not the offset (C-ADDR).
- **No JS throws on the hot path.** All faults go through `raiseE` (C-ERR).

---

## 7. Fidelity notes

| Aspect | Tag | vs original Tierra |
|---|---|---|
| `mal → copy → divide` three-phase life-cycle | **[CORE]** | Preserved exactly (`04` §4). |
| `MovPropThrDiv = 0.7` divide gate | **[CORE]** | Preserved exactly (`soup_in.h:93`; ISA §9). Evaluated in integers. |
| Write-protect daughter to the mother only | **[CORE]** | Preserved (the parasite niche, ISA §2.3). |
| `mal` frees any prior undivided daughter | **[CORE]** | Preserved (`04` §4a; `memalloc.c`). |
| Divide moves mother **down** reaper; error moves **up** | **[CORE]** | Preserved (`DownReperIf`/`UpRprIf`, `04` §2b/§4c). |
| Daughter gets fresh CPU, own IP at its start, both queues | **[CORE]** | Preserved (`EntBotSlicer`+`EntBotReaper`, `04` §4c). |
| Fill measured as **distinct-byte count via bitmask** | **[MOD]** | Tierra uses `mov_daught` count + `MovOff*` span; we use a distinct-byte bitmask — tighter, simpler, integer, same intent (§3). |
| `mal` allocation strategy | **[MOD]** | First-fit default vs Tierra's 6 `MalMode`s; allocation *order* is what matters (ISA §10 ledger). |
| Random daughter ejection (`EjectRate=50`) | **[OPTIONAL]** | Omitted from M0 core (experiment switch; keeps `mal`/`divide` RNG-free). |
| `DivSameSiz`/`DivSameGen` freeze switches | **[OPTIONAL]** | Omitted (both off by default in Tierra). |
| Multi-CPU daughters (`MaxCpuPerCell`), 3-mode divide | **[OPTIONAL]** | Single-CPU daughter, single-step divide (threads deferred; ISA §4.10). |
| `MinGenMemSiz` / span guard | **[OPTIONAL]** | Subsumed by the distinct-byte gate. |

All **[CORE]** rows are non-negotiable and are exactly the mechanics that shape what evolves.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in
[`packages/engine/test/08-repro.test.ts`](../../../../packages/engine/test/08-repro.test.ts).

- **REPRO-001** — `mal` with a valid size (`MinCellSize ≤ size ≤ maxCellSize`) allocates a
  daughter block and returns its start address in register `A`.
- **REPRO-002** — after a successful `mal`, the daughter block `[dauStart, dauStart+dauSize)`
  is write-protected to the mother: the mother `canWrite` there, and no other creature can.
- **REPRO-003** — `mal` with size below `MinCellSize` (12) fails: sets `E`, allocates
  nothing, and leaves `A` unchanged.
- **REPRO-004** — `mal` with size above `maxCellSize` fails: sets `E`, allocates nothing.
- **REPRO-005** — a second `mal` before `divide` frees the prior undivided daughter block
  (no overlap, no leak) and resets `dauWritten`/`dauWriteMask` for the new block.
- **REPRO-006** — a `movii` write into the daughter increments `dauWritten` and sets the
  corresponding `dauWriteMask` bit (distinct-byte count via `markDaughterWrite`).
- **REPRO-007** — rewriting an already-written daughter byte does **not** advance
  `dauWritten` (the mask bit is already set) — the 0.7 gate cannot be cheated.
- **REPRO-008** — a `movii` whose destination is outside both the mother cell and the
  daughter block is denied (C-PROT), sets `E`, writes nothing, and does not count.
- **REPRO-009** — `divide` with no allocated daughter (`dauStart < 0`) fails and sets `E`.
- **REPRO-010** — `divide` before the daughter is ≥ `MovPropThrDiv` (0.7) filled fails and
  sets `E`, and does not mutate the daughter fields.
- **REPRO-011** — the 0.7 gate is evaluated in integers (`dauWritten*10 ≥ dauSize*7`): for a
  size-80 daughter, 55 distinct bytes fail and 56 pass.
- **REPRO-012** — `divide` at ≥ 0.7 fill creates a new independent creature over exactly
  `[dauStart, dauSize)`, enqueued in **both** the slicer and reaper queues.
- **REPRO-013** — the daughter creature gets a fresh zeroed CPU with `IP` at **its own**
  start address (not the mother's).
- **REPRO-014** — the daughter gets a monotonic `id` (`world.nextId++`), `parentId` = the
  mother's id, and `bornAtCycle` = the current cycle.
- **REPRO-015** — a successful `divide` fires the genebank birth hook for the daughter.
- **REPRO-016** — a successful `divide` moves the mother **down** the reaper queue (away from
  death) and increments `world.births`.
- **REPRO-017** — after a successful `divide` the mother's daughter fields are cleared
  (`dauStart=-1`, `dauSize=0`, `dauWritten=0`, mask released).
- **REPRO-018** — the canonical `0080aaa` self-replication sequence (locate → `mal` → copy
  loop → `divide`) with mutation off yields a daughter whose bytes are **identical** to the
  mother's (breeds true, sterile — one genotype).

---

## 9. Open questions

1. **`maxCellSize` source.** Tierra bounds `mal` by `MaxMalMult * ce->mm.s`
   (`04` §4a). Do we adopt the same mother-relative cap, or a scenario-flat `maxCellSize`?
   (Proposal: scenario-flat in M0, `MaxMalMult` hook deferred.)
2. **Reap-to-make-room floor.** When the population is at `NumCellsMin`, `mal` on a full soup
   returns `E`. Confirm the floor is 1 (Tierra `NumCellsMin=1`) for M0.
3. **`markDaughterWrite` on self-writes.** A creature writing inside its **own** cell (self
   repair) is intentionally not counted (offset out of daughter range). Confirm no genome
   relies on self-writes counting toward the gate. (Ancestor does not.)
4. **Daughter block zeroing.** On `divide`, born bytes are exactly what the copy loop wrote;
   we do not re-zero the tail (unwritten ≤ 30%). Confirm this matches the desired
   breed-true semantics for partially-copied (mutant) daughters.
