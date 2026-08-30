# Reaper / Death — Engineering Spec              (Code: REAP · Milestone: M0)

**Status:** v1, M0. The reaper is the engine's **space/age selective force**: the death queue
that decides *who dies when the soup runs out of room*. Together with the slicer (§[09],
CPU/energy), it forms Tierra's two-force fitness regime — the slicer meters CPU time, the
reaper meters space and age.

Upstream refs:
- [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §10 (reaper), §8 (reap-to-make-room from the
  allocator), §11 (reproduction wiring: `moveDown` on divide).
- [`00-architecture.md`](00-architecture.md) §5 contracts, §6 glossary, §8 conventions.
- Reference: [`04-population-dynamics.md`](../../../original-tierra/04-population-dynamics.md)
  §Reaper (`queues.c` `UpReaper`/`DownReaper`/`EntBotReaper`/`RmvFrmReaper`; `tierra.c`
  `reaper`/`ReapCell`; termination codes; the vestigial fecundity queue in v6.02).

**Contracts obeyed:** C-DET (base reaper draws **no** randomness; ordering is a deterministic
function of execution order), C-ID, C-SNAP (queue links are serializable state), C-ERR (an
`E` event is what moves a creature up). Holds **INV-QUEUE** (every live creature in exactly
one reaper position; dead creatures in none).

Fidelity: **[CORE]** — preserve Tierra's dynamics exactly. The base reaper is deterministic;
Tierra's `ReapRndProp` random-top-N victim selection is a later **[MOD]** toggle (§7).

---

## 1. Purpose & responsibility

The reaper owns the **death queue** and the act of **killing**. It guarantees that: (a) every
live creature occupies exactly one queue position; (b) the position of a creature is a
deterministic function of its history of errors and reproductions and the order those events
occur in; (c) when the soup has no room, creatures are freed **head-first** (oldest / most
error-prone first) until room exists or the population is empty; and (d) every kill frees the
creature's soup (mother cell plus any undivided daughter), unlinks it from **both** queues,
fires the genebank death hook, and bumps `deaths`. It is the sole authority that removes live
creatures, so it is where INV-QUEUE and (jointly with the allocator §[03]) INV-MEM are
maintained on the death side.

---

## 2. Interfaces

TypeScript surface (`reaper.ts`). Imports **downward only**: `creature`, `alloc`, `genebank`
(§[00] module graph). Functions take `World` as context; no reach-up.

```ts
// reaper.ts
interface ReaperQueue {
  head: Creature | null;   // next to die (oldest / most error-prone)
  tail: Creature | null;   // youngest / safest (newest entrant)
  size: number;            // count of live creatures in the queue
}

// enqueue a freshly born (or injected) creature at the TAIL (youngest, safest).
function enqueueReaper(w: World, c: Creature): void;

// move c one position toward the head (toward death). Called on an E event.
function moveUp(w: World, c: Creature): void;

// move c one position toward the tail (toward safety). Called on a successful divide.
function moveDown(w: World, c: Creature): void;

// kill c: free its cell (+ undivided daughter) via alloc, fire genebank death hook,
// unlink from slicer AND reaper queues, deaths++. Returns nothing.
function kill(w: World, c: Creature): void;

// reap the head repeatedly until `need` bytes are allocatable or the queue empties.
// Bounded (never loops on an empty queue). Returns true if room was made / population
// non-empty enough to retry; the allocator (§[03]) drives the actual alloc retry.
function reapUntilRoom(w: World, need: number): boolean;

// soup-fullness trigger: reap head(s) while fullness > threshold (bounded). Called from
// the tick loop / after allocation. Uses World.reaper.threshold (Scenario config).
function reapToThreshold(w: World): void;
```

Who calls it:
- **Allocator** §[03] `findFree`/`mal` calls `reapUntilRoom` when the soup is full and a
  daughter block is needed (M0-TECH-DESIGN §8: "if none and soup is full, ask the reaper to
  kill until room or empty, bounded").
- **World tick loop** §[09]/§[07] may call `reapToThreshold` when fullness crosses the
  configured threshold.
- **CPU/error protocol** §[07]/§[01]: `raiseE(c)` calls `moveUp` (C-ERR).
- **Reproduction** §[08]/§[11]: successful `divide` calls `enqueueReaper(daughter)` and
  `moveDown(mother)`.

## 3. Data structures

Intrusive doubly-linked links live **on the `Creature`** (`creature.ts`), so movement is
O(1) with no allocation on the hot path:

| Field | Type | Why / units | Invariant |
|---|---|---|---|
| `reaperPrev` | `Creature \| null` | link toward head; `null` at head | live ⇒ consistent with next |
| `reaperNext` | `Creature \| null` | link toward tail; `null` at tail | live ⇒ consistent with prev |
| `errorCount` | `number` (int) | lifetime `E` events; conceptual age/fitness key | monotonic ≥ 0 |
| `bornAtCycle` | `number` (int) | for age framing / stats; not the ordering key | set at birth |

`World.reaper: ReaperQueue` holds `head`/`tail`/`size`. `World.deaths: number` is the death
counter. **Ordering is implicit in position**, not stored as a number: there is no age
counter used to sort — a creature's queue position *is* its age/fitness rank (matches Tierra,
`04-population-dynamics.md` §2b "age is implicit in queue position"). New creatures enter at
the tail; they drift toward the head as older creatures above them die, and are nudged by
`moveUp`/`moveDown`.

**INV-QUEUE (reaper half):** at every quiescent point, following `reaperNext` from `head`
visits exactly the live population once and terminates at `tail` (`reaperNext == null`); the
reverse via `reaperPrev` from `tail` terminates at `head`. `size == population`. A dead
creature has `reaperPrev == reaperNext == null` and is not reachable from `head`/`tail`.

## 4. Behavior / algorithms

### 4a. Enqueue at the tail (birth / injection)
A new creature is the youngest and safest, so it enters at the **tail**:
```
enqueueReaper(w, c):
  c.reaperNext = null
  c.reaperPrev = w.reaper.tail
  if w.reaper.tail: w.reaper.tail.reaperNext = c
  else:             w.reaper.head = c          // first creature: head == tail
  w.reaper.tail = c
  w.reaper.size += 1
```

### 4b. `moveUp(c)` — one step toward death (on an `E` event)
Swap `c` with its predecessor (the neighbour nearer the head). One position per call
(Tierra `UpReaper`), O(1). If `c` is already the head, it is a no-op.
```
moveUp(w, c):
  p = c.reaperPrev
  if p == null: return                 // already head, nothing above it
  # unlink c, splice it in ahead of p (relink the ≤6 affected pointers + head/tail)
  ...relink so order becomes [... p.prev, c, p, c.next ...]...
```
Called by `raiseE(c)` (C-ERR): failed template, illegal write, div-by-0, illegal divide,
stack fault, alloc fail. **Mistakes are selected against** — error-prone code climbs toward
the reaper.

> FIDELITY NOTE: Tierra's `UpRprIf` moves up only *iff* `c.flags >= flags of the cell above*
> (`queues.c:168`). M0 base uses an unconditional one-step `moveUp` on each E event; the
> conditional variant is behaviourally equivalent under the age/error framing and may be
> adopted if golden runs require it. Either way: **no RNG**, deterministic in execution order.

### 4c. `moveDown(c)` — one step toward safety (on a successful divide)
Symmetric to `moveUp`; swap `c` with its successor (neighbour nearer the tail). One position
per call (Tierra `DownReaper`), O(1). No-op if `c` is the tail. Called from `divide` §[08]
(and, if implemented, on a successful `mal` per Tierra `DownReperIf`) — **fecund cells sink
away from death.**

### 4d. `kill(c)` — free and unlink
```
kill(w, c):
  alloc.free(w, c.start, c.size)               // §[03]: return mother cell to free intervals
  if c.dauStart >= 0:                          // undivided daughter still owned by c
      alloc.free(w, c.dauStart, c.dauSize)     // free the orphan daughter block too
      c.dauStart = -1; c.dauSize = 0
  genebank.onDeath(w, c)                        // §[12] death hook (M0: mark not-alive)
  unlinkSlicer(w, c)                            // §[09]: remove from slicer queue
  unlinkReaper(w, c)                            // remove from reaper queue (below)
  w.creatures.delete(c.id)                      // id→object lookup no longer live
  w.deaths += 1
```
`unlinkReaper` fixes `head`/`tail` if `c` was either, splices `c.reaperPrev`↔`c.reaperNext`,
then nulls `c`'s own links (dead ⇒ in neither queue). Freeing both the mother cell and an
undivided daughter keeps INV-MEM (`Σ sizes + free == soupSize`) intact.

### 4e. `reapUntilRoom(need)` — reap-to-make-room (allocator-driven, bounded)
```
reapUntilRoom(w, need):
  while w.reaper.size > 0:
      if alloc.canFit(w, need): return true    # room exists; allocator retries the alloc
      kill(w, w.reaper.head)                    # kill the oldest / most error-prone
  return false                                  # soup emptied without ever fitting
```
**Bounded & terminating:** each iteration either returns or removes exactly one creature, and
`kill` strictly decreases `w.reaper.size`; the loop cannot run more than `size` times and
always stops when the queue empties (M0-TECH-DESIGN §8). The allocator (§[03]) owns the retry
of the actual `findFree` once room is reported.

### 4f. `reapToThreshold()` — fullness trigger
```
reapToThreshold(w):
  while w.reaper.size > 0 and fullness(w) > w.reaper.threshold:
      kill(w, w.reaper.head)
```
`fullness(w) = (soupSize - freeBytes) / soupSize` conceptually, but computed with integer
math (compare `occupiedBytes * denom` vs `threshold * soupSize` scaled to integers — no float
on the fate path, C-DET). `threshold` is `Scenario.reaper.threshold` (configurable). Both
triggers (fullness and allocation-need) are supported, matching Tierra which does both
(M0-TECH-DESIGN §18 Q3).

## 5. Interconnections

- **calls** `alloc.free`/`alloc.canFit` (§[03], C-ADDR/INV-MEM), `genebank.onDeath` (§[12]),
  `unlinkSlicer` (§[09]).
- **called by** the allocator (`reapUntilRoom` during `mal` on a full soup), the tick loop
  (`reapToThreshold`), `raiseE` (`moveUp`, C-ERR), and `divide` (`enqueueReaper` +
  `moveDown`).
- **contracts crossed:** removing a creature must leave INV-QUEUE and INV-MEM true; the death
  hook feeds the genebank/stats (birth/death events, §[13]); no floating point touches the
  ordering or the victim choice (C-DET).

## 6. Determinism & edge cases

- **No RNG in the base reaper.** The victim is always the head; movement is exactly one step
  per event. Given the same sequence of (`E`, `divide`, `enqueue`, `reapUntilRoom`) events in
  the same order, the queue evolves identically (C-DET, INV-DET). This is what makes the
  ancestor breed-true run reproducible.
- **`moveUp` at head / `moveDown` at tail:** no-ops (guarded), never corrupt links.
- **Single-creature queue:** `head == tail`; `moveUp`/`moveDown` are no-ops; `enqueue` of a
  second creature makes the first the head.
- **Reaping the currently-executing creature:** the tick loop breaks the current slice early
  when the running creature is killed (§[09]); `kill` is safe to call on it because it unlinks
  from the slicer and the slice loop checks liveness.
- **Empty queue:** `reapUntilRoom`/`reapToThreshold` return immediately; never loop forever
  (bounded by `size`). If the population reaches zero, the allocator's caller handles the
  "no room, ever" outcome (the `mal` raises `E`).
- **Undivided daughter on death:** freed as well (§4d) so orphan blocks never leak.
- **Integer fullness:** threshold comparison is integer-scaled; no float on the fate path.

## 7. Fidelity notes

- **[CORE]** Two-force framing (slicer = CPU/energy, reaper = space/age/death), bottom-entry /
  top-exit queue, `UpReaper` on error, `DownReaper` on reproduction, one-position moves, and
  freeing mother + undivided daughter — all preserved exactly from v6.02
  (`04-population-dynamics.md` §2, §4).
- **[MOD]** `moveUp` is unconditional-one-step vs Tierra's conditional `UpRprIf`/`DownReperIf`
  (`>=`/`<=` flags of the neighbour). Behaviour-equivalent under age/error ordering; impl
  modernized for simplicity. Base reaper picks `TopReap` deterministically (Tierra's
  `ReapRndProp = 0.0` default ⇒ deterministic top pick).
- **[MOD] later toggle:** `ReapRndProp` random-top-N victim selection (`reaper()` step 3,
  `04-population-dynamics.md` §2c) — a Scenario flag that, when > 0, draws one victim from the
  top `ReapRndProp * population` via `world.rng`. **Off in M0** (deterministic head).
- **[OPTIONAL] deferred:** lazy-reaping (`LazyTol` vs `RepInst`, §1e), disturbance
  (`DistFreq`/`DistProp`, §3), `MalReapTol` targeted locality reaping, random ejection
  (`EjectRate`), and the NET-only paths (`Apocalypse`, surf/subnet). Termination codes
  (`REAP_SOUP_FULL=5`, `REAP_LAZY=1`, `REAP_DISTURB=2`, …, `04-population-dynamics.md`
  §Termination codes) are reference-only in M0; M0 records a single death event.
- **Fecundity queue:** Tierra declares `q.h_fecu`/`q.l_fecu` but **no shipped v6.02 code
  walks or reaps by it — vestigial** (`04-population-dynamics.md` §Fecundity queue). Not
  implemented.

## 8. Acceptance criteria

Each maps 1:1 to a `it.todo` in `packages/engine/test/10-reaper.test.ts`. IDs are
append-only; never renumber.

- **REAP-001** A newly born (or injected) creature is enqueued at the **tail** of the reaper
  queue (youngest/safest); the pre-existing tail becomes its `reaperPrev`.
- **REAP-002** When room is needed and the population is non-empty, the creature at the
  **head** is killed first (oldest / most error-prone dies first).
- **REAP-003** An `E` event on a creature calls `moveUp`, moving it **exactly one** position
  toward the head; a creature already at the head stays at the head (no-op).
- **REAP-004** A successful `divide` calls `moveDown` on the mother, moving it **exactly one**
  position toward the tail; a creature already at the tail stays at the tail (no-op).
- **REAP-005** `kill(c)` frees `c`'s mother cell **and any undivided daughter block** via the
  allocator (§[03]) and unlinks `c` from **both** the slicer and reaper queues, leaving it in
  neither (INV-QUEUE), and increments `deaths`.
- **REAP-006** Soup fullness crossing the configured `threshold` triggers reaping of the head
  (`reapToThreshold`), and reaping stops once fullness is at or below the threshold.
- **REAP-007** `reapUntilRoom(need)` is **bounded**: it reaps the head repeatedly until room
  for `need` bytes exists or the queue empties, performs at most `size` kills, and terminates
  (returns `false`) when the soup empties without ever fitting.
- **REAP-008** The base reaper uses **no RNG**: victim choice is always the head and every
  move is one deterministic step, so an identical event order yields an identical queue
  (C-DET / INV-DET); `ReapRndProp` random-top is a later [MOD] toggle, off in M0.

## 9. Open questions

1. **Conditional vs unconditional moves** — adopt Tierra's `UpRprIf`/`DownReperIf` `>=`/`<=`
   neighbour-flags guard, or the simpler unconditional one-step? (M0 §4b uses unconditional;
   revisit if golden trajectories diverge from a v6.02 reference run.)
2. **Trigger cadence** — run `reapToThreshold` every tick, every allocation, or only when
   `mal` needs room? (M0-TECH-DESIGN §18 Q3 proposes both; confirm the fullness-check cadence
   so it stays deterministic and cheap.)
3. **`avgSize` coupling** — the allocator's `canFit` and any future `MalReapTol` locality
   reaping depend on `avgSize`; confirm it is updated deterministically on each birth/death
   (M0-TECH-DESIGN §18 Q2) before locality reaping is considered.
