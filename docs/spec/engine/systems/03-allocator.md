# Allocator — Engineering Spec              (Code: ALLOC · Milestone: M0)

**Status:** v1. Owns daughter-cell allocation over the soup's free space.
**Upstream:** [`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md) §4.9 (mal/divide semantics), §9 (`MinCellSize=12`);
[`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §8 (deterministic first-fit allocator), §11 (mal usage/reproduction bookkeeping).
**Reference:** [`docs/original-tierra/03-memory-soup.md`](../../../original-tierra/03-memory-soup.md)
(the 6 `MalMode` strategies + Cartesian free-tree — fidelity only).
**Contracts obeyed:** C-DET (ordered scan, no RNG unless a strategy draws), C-INT (integer sizes/addresses),
C-ADDR (all soup addressing via `ad()`), C-SNAP (state lives in `World`; no module-level mutable state),
C-ERR (allocation failure ⇒ caller `raiseE`). Upholds global invariant **INV-MEM**.

---

## 1. Purpose & responsibility

The allocator owns the soup's **free space** and hands out **daughter cells** to reproducing
creatures. It is the sole authority on which soup intervals are occupied. It guarantees, at
all times, that occupied intervals **never overlap** and that `Σ(cell sizes) + free ==
soupSize` (**INV-MEM**). It provides `mal`'s placement decision: given a requested size, find
a free gap (deterministic **first-fit** by default), reaping the reaper-queue head when the
soup is too full to satisfy the request, and record the allocation as the mother's daughter
block. It frees intervals on death/re-`mal` and coalesces adjacent free space implicitly (the
occupied-interval representation makes coalescing free — a freed interval simply vanishes from
the list). It performs **no writes to soup bytes** and enforces **no protection** — that is
Soup's job (`[02]`); the allocator only tracks bounds.

---

## 2. Interfaces

```ts
// alloc.ts — imports: soup, types. Imported by: reaper, world (via mal handler), engine API (inject).
type Addr = number;   // soup index, always taken mod soupSize on access (C-ADDR)

interface Interval { start: Addr; size: number; }   // occupied region [start, start+size)

interface Allocator {
  // Scan gaps left→right; return the start of the first gap of at least `size`, else -1.
  findFree(size: number): Addr;

  // Mark [start, start+size) occupied. Precondition: the interval is wholly free and does
  // not overlap any occupied interval (else fatal — a programming error, not a creature fault).
  reserve(start: Addr, size: number): void;

  // Mark [start, start+size) free again. Precondition: exactly this interval is occupied.
  free(start: Addr, size: number): void;

  occupancy(): number;    // Σ(sizes) of occupied intervals
  freeSpace(): number;    // soupSize − occupancy()
  intervals(): readonly Interval[];   // sorted by start (for snapshot/tests/INV-MEM checks)
}

// The strategy hook (default = first-fit). Deferred behind an interface so the 6 Tierra
// MalMode placement policies can be added later without touching mal's control flow.
interface MalStrategy {
  // Return a start address for `size`, or -1 if none. `w` gives access to rng/registers
  // for strategies that need them; first-fit ignores everything but the allocator.
  place(alloc: Allocator, w: World, c: Creature, size: number): Addr;
}
```

- **Consumers.** The `mal` handler (`isa/handlers.ts`, driven by `[08]` reproduction) calls
  the mal flow (§4.2). The `reaper` (`[10]`) calls `free()` when it kills a cell. The Engine
  API `inject` (`[15]`) calls `findFree`+`reserve` to place a genome. Snapshot (`[14]`)
  serializes `intervals()`.
- **Ownership.** The `Allocator` instance is a member of `World` (C-SNAP); `soupSize` is fixed
  for a run. No allocator metadata lives inside the soup (unlike Tierra's in-array-index tree —
  ours is a plain side list, trivially serializable).

---

## 3. Data structures

**Representation: a sorted list of occupied intervals, keyed by `start`.**

| Field | Type | Why / units | Invariant it holds |
|---|---|---|---|
| `occupied` | `Interval[]` sorted ascending by `start` | the set of live cells + gestating daughters; integer addresses/sizes (C-INT) | disjoint & non-touching-or-touching but never overlapping; each `size ≥ 1` |
| `soupSize` | `number` (integer) | the ring size; the free space is the complement of `occupied` within `[0, soupSize)` | fixed for the run |

- **Why occupied-intervals (not free-intervals).** Occupied count == live-cell count (small,
  bounded by population); frees are cheap (splice one entry out — coalescing is automatic
  because a gap is just "absence between two occupied intervals"); `INV-MEM`'s `Σsizes` is a
  direct sum over the list. Gaps are computed on demand during `findFree`, never stored, so
  there is no free-list to keep coalesced.
- **Gaps are computed, not stored.** With `occupied` sorted, the free gaps are: `[0,
  occ[0].start)`, then `[occ[i].end, occ[i+1].start)` for each adjacent pair, then
  `[occ[last].end, soupSize)`. Each gap width is `next.start − prev.end` (or the soup edge).
  **No wrap gap** is treated as a single allocatable region: a daughter cell is a **contiguous
  non-wrapping** `[start, start+size)` (Tierra allocates contiguous blocks; wrap is an
  *addressing* property for reads/execute/templates, not for cell layout). This keeps `findFree`
  and INV-MEM simple and matches how `canWrite` bounds a cell.
- **Determinism note.** `occupied` is the **only** ordering the allocator ever traverses, and it
  is a sorted array — never a `Map`/object key order (C-DET). Tests read `intervals()` to assert
  INV-MEM after churn.

Constants (from ISA-VM-SPEC §9; validated by `config.ts`):

| Constant | Value | Meaning (allocator use) |
|---|---|---|
| `MinCellSize` | 12 | requests below this are rejected (`raiseE`) before any scan |
| `MaxMalMult` | 3 (integer) | daughter size cap = `MaxMalMult × motherSize`; larger ⇒ reject |
| `maxCellSize` | derived / config | absolute upper bound on a cell (≤ soupSize); larger ⇒ reject |

---

## 4. Behavior / algorithms

### 4.1 `findFree(size)` — deterministic first-fit

```
findFree(size):
  if occupied is empty:
      return (size <= soupSize) ? 0 : -1
  # gap before the first interval
  if occupied[0].start >= size:
      return 0
  # gaps between adjacent occupied intervals
  for i in 0 .. len(occupied)-2:
      gapStart = occupied[i].start + occupied[i].size
      gapEnd   = occupied[i+1].start
      if gapEnd - gapStart >= size:
          return gapStart
  # trailing gap to the soup edge
  tailStart = occupied[last].start + occupied[last].size
  if soupSize - tailStart >= size:
      return tailStart
  return -1
```

- Scan is strictly **left→right** over the sorted list ⇒ returns the **earliest** gap that
  fits (first-fit), deterministically. Exact-fit (`gapWidth == size`) returns that gap. No RNG.
- Size is assumed already validated (§4.3) — `findFree` itself does not check `MinCellSize`.

### 4.2 The `mal` flow (daughter-cell allocation)

Driven by `exec_mal` (`[08]`/`[04]`), size taken from register `C` (per classic32 binding
`mal: A←C`):

```
mal(world, c):
  size = c.cpu.reg[C]
  # ---- validation (§4.3); any failure ⇒ raiseE(c), return, no state change ----
  if size < MinCellSize:                      raiseE(c); return
  if size > MaxMalMult * c.size:              raiseE(c); return
  if size > maxCellSize (or > soupSize):      raiseE(c); return

  # ---- free any prior undivided daughter (re-mal reclaims the old embryo) ----
  if c.dauSize > 0:
      alloc.free(c.dauStart, c.dauSize)
      c.dauStart = -1; c.dauSize = 0           # (dead-daughter bytes left as-is; DeadMemInit≡0 [MOD])

  # ---- placement via strategy hook (default first-fit), reaping to make room ----
  addr = strategy.place(alloc, world, c, size)   # first-fit: alloc.findFree(size)
  while addr < 0:
      if not reaper.killHeadForSpace(world):     # returns false when queue empty / at floor
          break                                  # soup un-clearable → allocation fails
      addr = strategy.place(alloc, world, c, size)
  if addr < 0:                                    raiseE(c); return   # C-ERR: alloc failure

  # ---- commit ----
  alloc.reserve(addr, size)
  c.dauStart = addr; c.dauSize = size
  c.dauWritten = 0
  c.dauWriteMask = new Uint8Array(size)          # reset write-mask (distinct-byte counting)
  c.cpu.reg[A] = addr                            # mal result: A := daughter start
```

- **Reap-to-make-room is bounded & deterministic.** Each loop iteration kills exactly the
  **reaper-queue head** (`[10]`, ordered), which `free()`s its cell (and any undivided daughter),
  strictly increasing free space. The loop terminates: it stops when either a gap of `size`
  appears, or the reaper refuses (empty queue / population floor `NumCellsMin`). No infinite
  loop, no RNG in the base path.
- **Ordering with re-`mal` free:** the prior-daughter `free()` happens **before** placement, so
  a creature re-`mal`ing the same/adjacent region can reuse its own just-freed space (matches
  Tierra `mal()` ordering — dealloc old embryo, then allocate).
- **`inject` (Engine API `[15]`)** uses the same primitives without the daughter bookkeeping:
  `addr = findFree(genome.length); if addr < 0 raise/refuse; reserve(addr, len)`; it does **not**
  reap (injection is a host action, not a creature fault).

### 4.3 Validation & rejection (all before touching allocator state)

1. `size < MinCellSize(12)` ⇒ reject. (Smallest allocatable cell.)
2. `size > MaxMalMult × motherSize` ⇒ reject. (Caps runaway growth — Tierra `MaxMalMult`.)
3. `size > maxCellSize` / `size > soupSize` ⇒ reject. (Cannot ever fit.)

All rejections set `E` and leave `A`, the daughter fields, and `occupied` **unchanged**.

### 4.4 `free(start, size)` — release & implicit coalesce

Splice the exact `{start,size}` interval out of `occupied`. Coalescing is automatic: two
formerly-separated gaps become one contiguous gap the next time `findFree` scans. Called by the
reaper on `kill` (mother cell **and** any undivided daughter) and by `mal` on re-allocation.

---

## 5. Interconnections

- **Calls down:** `Soup` (`[02]`) only for `soupSize` (never reads/writes bytes; the copy loop
  and `canWrite` are Soup's). Nothing else.
- **Called by:**
  - `mal` handler / Reproduction (`[08]`) — the mal flow (§4.2), crossing C-ERR (failure ⇒
    `raiseE`) and C-INT (integer size from register `C`).
  - Reaper (`[10]`) — `killHeadForSpace` calls `free()`; the mal loop calls the reaper. This is
    the one two-way edge (alloc ⇄ reaper) shown in the system map, and it is **acyclic at
    compile time**: `reaper` imports `alloc`; `alloc`'s mal flow receives the reaper via `World`
    at call time (not an import), preserving the downward-only module rule (§00 architecture).
  - Engine API `inject` (`[15]`) — `findFree`+`reserve`.
  - Snapshot (`[14]`) — serializes `intervals()`; restore replays them into `occupied`.
- **Contracts crossed:** C-DET (the ordered gap scan is the deterministic placement decision the
  whole run depends on); INV-MEM (this system is its primary guardian).

---

## 6. Determinism & edge cases

- **Ordered scan (C-DET):** first-fit walks `occupied` left→right; identical soups ⇒ identical
  placement. The reap loop consumes the reaper's **ordered** queue head. **No `world.rng` draw**
  occurs on the first-fit path; a future `MalStrategy` (e.g. `random`, Tierra `MalMode 2`) is the
  *only* place RNG may enter, and it must draw from `world.rng` in a fixed order (C-DET).
- **Integer domain (C-INT):** sizes/addresses are integers; gap widths are integer subtraction.
  No floating point (Tierra's `MaxMalMult=3.0`/`MalTol` floats are integerized here).
- **Soup full, request unsatisfiable:** reap until a gap appears; if the reaper hits the floor or
  empties with still no gap ⇒ `raiseE` (C-ERR), state unchanged. A creature can therefore fail to
  reproduce in a saturated soup — an intended selective pressure.
- **Exact fit:** a gap exactly `size` wide is returned and consumed, leaving zero slack.
- **Re-`mal` before divide:** old daughter freed first (§4.2), so no leak and no double-reserve.
- **Zero/negative size:** caught by `size < MinCellSize` (12 > 0), so never reaches the scan.
- **No wrap-around cell:** cells are contiguous non-wrapping; a request larger than the biggest
  single gap (even if total free ≥ size, fragmented) fails after reaping cannot help — matches
  Tierra returning `-1` when the root/biggest free area `< size`.
- **Faults never throw (C-ERR):** allocation failure is `raiseE`, not a JS exception; only a true
  precondition violation in `reserve`/`free` (overlap / freeing a non-occupied interval — a
  *bug*, not a creature action) is fatal.

---

## 7. Fidelity notes

| Aspect | Tierra | tierra26 | Tag | Why |
|---|---|---|---|---|
| Placement policy | 6 `MalMode` strategies (first/better/random/near-mother/near-reg/near-stack), default **random (mode 2)** | **first-fit default**, 6 modes deferred behind `MalStrategy` | **[MOD]** | Allocation *order* is what shapes the ecology; first-fit is fully deterministic and adequate for M0. The hook keeps the seam for M1+ placement experiments. |
| Free-space structure | **Cartesian free-tree** (`MemFr`/`FreeMemry[]`, array-index pointers, promote/demote/root-insertion) | **sorted occupied-interval list**; gaps computed on demand | **[MOD]** | Tree machinery is 1990s-C performance/portability engineering (the doc itself flags it as replaceable). An interval list gives nearest-first fit + free coalescing and serializes trivially (C-SNAP). |
| Coalescing on free | explicit neighbour-merge in `MemDealloc` | **implicit** — a freed interval simply leaves the list; adjacent gaps merge on next scan | **[MOD]** | Same net semantics; no separate coalesce pass needed with the occupied representation. |
| Placement pref + tolerance (`MalLimit`, `MalReapTol`) | Friendly-Fit `pref`/`tol`; reaper kills near a target address | not in M0 (first-fit ignores `pref`); base reaper kills the ordered head | **[MOD]** | Localized reaping is a placement-policy refinement; deferred with the `MalStrategy` hook. |
| Size cap / min | `MaxMalMult=3.0`, `MinCellSize=12`, `MalSamSiz` | `MaxMalMult=3` (int), `MinCellSize=12`; `MalSamSiz` deferred | **[MOD]/[CORE]** | Caps/min preserved (size-distribution-shaping); float→int for determinism. |
| Size perturbation (`flaw()` on `mal` size) | size may be ±1 via flaw | M0 flaw rate 0 (identity); seam via mutation | **[CORE]** (rate 0 in M0) | Consistent with engine-wide M0 mutation-off. |
| `DeadMemInit` (freed bytes 0/zeroed/random) | run param, default 0 (leave code) | freed bytes left as-is (mode 0) | **[MOD]** | Default preserves executable corpses (parasite fodder); allocator doesn't touch bytes. |
| Reaper-driven retry-until-space | `while(MemAlloc<0) reaper(...)` | same bounded loop over ordered reaper head | **[CORE]** | The full/death dynamics depend on it. |

All INV-MEM-critical semantics (disjoint contiguous cells, `Σsizes+free==soupSize`, reap-to-fit,
free-on-death) are preserved exactly; only the internal data structure and default placement
policy are modernized.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in [`packages/engine/test/03-alloc.test.ts`](../../../../packages/engine/test/03-alloc.test.ts).
IDs are append-only.

- **ALLOC-001** — `findFree(size)` returns the **earliest** (leftmost) gap that fits: given
  occupied intervals with an early gap ≥ size and a later gap ≥ size, the early gap's start is
  returned (first-fit picks earliest gap).
- **ALLOC-002** — **exact fit:** a gap exactly equal to `size` is selected and returned; after
  `reserve`, that gap has zero remaining slack.
- **ALLOC-003** — **no room:** when no single gap is ≥ size (even if total free ≥ size due to
  fragmentation), `findFree` returns `-1`.
- **ALLOC-004** — **empty soup:** with no occupied intervals, `findFree(size)` returns `0` for
  `size ≤ soupSize` and `-1` for `size > soupSize`.
- **ALLOC-005** — **reap-to-make-room:** on `mal` into a full soup, the allocator kills the
  reaper-queue head (freeing its cell) and retries until a gap appears, then reserves; the
  daughter is placed in freed space.
- **ALLOC-006** — **reap floor / un-clearable:** if reaping cannot free enough (queue empty or at
  population floor), `mal` fails, sets `E`, and leaves `occupied` and register `A` unchanged.
- **ALLOC-007** — **free-on-death coalesces:** freeing an interval between two others yields a
  single contiguous gap; a subsequent `findFree` spanning the merged width succeeds where it
  would have failed against either sub-gap.
- **ALLOC-008** — **interval integrity after churn (INV-MEM):** after an arbitrary interleaving of
  `reserve`/`free`, `intervals()` stay sorted, pairwise non-overlapping, and
  `occupancy() + freeSpace() == soupSize`.
- **ALLOC-009** — **reject size < MinCellSize:** `mal` with `size < 12` sets `E`, allocates
  nothing, and leaves the daughter fields and `A` unchanged (no allocator scan performed).
- **ALLOC-010** — **reject oversize:** `mal` with `size > MaxMalMult × motherSize` (or
  `> maxCellSize`) sets `E` and allocates nothing.
- **ALLOC-011** — **re-`mal` frees prior undivided daughter:** a second `mal` before `divide`
  releases the previous daughter interval first (no leak, no double-reserve), then places the new
  one; `occupancy()` reflects only the new daughter.
- **ALLOC-012** — **successful `mal` records daughter & resets write-mask:** on success
  `dauStart/dauSize` are set, `dauWritten == 0`, `dauWriteMask` has length `size` and is all-zero,
  and register `A` holds the daughter start.
- **ALLOC-013** — **deterministic placement (C-DET):** two allocators driven with identical
  `reserve`/`free`/`mal` sequences produce identical `intervals()` and identical `findFree`
  results at every step; the first-fit path draws no `world.rng` value.

---

## 9. Open questions

1. **Reaper trigger coupling** — M0-TECH-DESIGN §18.3 leaves open whether reaping fires only on a
   soup-fullness threshold or also on every `mal` needing room. This spec assumes **both**: the mal
   flow reaps on demand (§4.2) *and* the reaper may fire on threshold (`[10]`). Confirm.
2. **`maxCellSize` source** — is it purely `MaxMalMult × motherSize`, a separate config absolute, or
   `min(config, soupSize)`? Assumed the tighter of the config bound and `soupSize` here.
3. **First `MalStrategy` to land in M1** — random (Tierra default, mode 2) vs near-mother (mode 3);
   affects when parasitism first emerges. Deferred, but the hook signature (§2) should not change.
4. **Injection under saturation** — should `inject` (`[15]`) be allowed to reap like `mal`, or must
   it refuse on a full soup? This spec has it refuse (host action, not a creature fault). Confirm.
