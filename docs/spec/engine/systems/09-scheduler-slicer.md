# Scheduler / Slicer — Engineering Spec              (Code: SLICE · Milestone: M0)

**Status:** v1. Defines the **slicer** — the round-robin time-slicing scheduler that makes
virtual-CPU time the limiting energy resource. Implements the shipped-default Tierra
scheduler (`RanSlicerQueue`, `SliceStyle=2`).

**Upstream refs:** [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §9 (scheduler/slicer + tick
model), §6 (execution: fetch–decode–execute). Reference:
[`04-population-dynamics.md`](../../../original-tierra/04-population-dynamics.md) §1 Slicer
(`RanSlicerQueue` `slicers.c:178-216`; `TimeSlice` `tierra.c:231-403`; queue ops
`queues.c:52-90,263-284`; `life()` loop `tierra.c:161-186`).

**Contracts obeyed (§[00]/5):** **C-DET** (the slice-size draw is the *only* RNG use in the
scheduler, in a fixed call order; traversal is always via the intrusive queue, never map
order), **C-INT** (base size, `2·size+1` bound, and the drawn slice are all integers),
**C-ID** (new creatures enter in `nextId` order, which is birth order), **C-SNAP** (the
queue is intrusive links + a cursor on `World` — no hidden module state).
Upholds **INV-QUEUE** (exactly one slicer position per live creature; none for the dead).

---

## 1. Purpose & responsibility

The slicer owns **who runs next and for how long**. Living creatures form a circular
round-robin; each turn ("slice") one creature executes `sliceSize(c)` instructions before the
cursor advances to the next. Because the slice budget is proportional to a creature's genome
`size`, CPU time behaves as an **energy quantum handed out in proportion to body size** — the
core Tierran resource economy. The slicer guarantees: (a) every live creature is visited
exactly once per pass, in **birth order**; (b) slice sizing is deterministic from the seed
(its single RNG draw); (c) a creature that dies mid-slice ends its slice cleanly without
corrupting the cursor or queue; (d) queue membership tracks life/death exactly (INV-QUEUE).
It does **not** own instruction semantics (that is CPU/handlers, §[07]/§[04]) nor death
decisions (that is the reaper, §[10]); it merely drives the loop and detects mid-slice death.

---

## 2. Interfaces

```ts
// scheduler.ts — imports: creature, rng (types via creature). World passed as arg.

/** The intrusive circular queue of living creatures, in birth order. Owned by World. */
interface SlicerQueue {
  cursor: Creature | null;   // the creature whose slice runs next; null iff empty
  length: number;            // live-creature count (== population)
}

/** Compute this turn's instruction budget for creature c. The ONLY RNG use here. */
function sliceSize(w: World, c: Creature): number;

/** Append a newborn at the tail (just "behind" the cursor in round-robin order). */
function slicerAppend(q: SlicerQueue, c: Creature): void;

/** Remove a creature (on death); if it was the cursor, advance the cursor first. O(1). */
function slicerRemove(q: SlicerQueue, c: Creature): void;

/** Run exactly one full slice for the cursor creature, then advance the cursor.
 *  Returns the number of instructions actually executed (< sliceSize if it died). */
function runSlice(w: World): number;
```

Creature carries the intrusive links (`04-population-dynamics.md` `n_time`/`p_time`):

```ts
// creature.ts (fields relevant to the slicer)
interface Creature {
  // ... id, start, size, cpu, ...
  slicerPrev: Creature | null;   // circular; points to self when it is the sole member
  slicerNext: Creature | null;
  alive: boolean;                // false once the reaper has killed it
}
```

**Who imports it:** `world.ts` only. `World.run()` / `World.step()` call `runSlice` /
`stepOne`. Reproduction (§[08]) calls `slicerAppend` on `divide`; the reaper (§[10]) calls
`slicerRemove` on `kill`. The scheduler imports `creature` and `rng`; nothing "below" it.

---

## 3. Data structures

**The slicer queue** = a **circular intrusive doubly-linked list** of *living* creatures,
ordered by birth (== ascending `id`, since ids are monotonic per C-ID). Links live on the
Creature itself (`slicerPrev`/`slicerNext`); the queue struct holds only a **round-robin
cursor** and a `length`.

| Field | Type | Why / units | Invariant |
|---|---|---|---|
| `cursor` | `Creature\|null` | the next creature to receive a slice | `null` iff `length==0`; else points at a live, linked creature |
| `length` | `number` (int) | live population; O(1) reads for `run`/stats | `== count of nodes reachable via slicerNext from cursor` |
| `slicerNext`/`slicerPrev` | links | circular ring; sole member points to itself | for every live `c`: `c.slicerNext.slicerPrev === c` |

**Why circular + intrusive:** append-tail, cursor-advance, and remove-on-death are all
**O(1)** with no allocation on the hot path (matches Tierra's `n_time`/`p_time` threading and
the "reused struct, no per-instruction allocation" rule, M0 §6). No array, no `Map`
traversal — required by C-DET (map/object key order is forbidden for ordered work).

**Newborns enter at the tail.** The tail is the node immediately *before* the cursor in the
ring (`cursor.slicerPrev`), i.e. the daughter runs *after* all creatures already ahead of the
cursor this pass — the same placement as Tierra's `EntBotSlicer` ("enter before the current
slice cell"). This keeps traversal in strict birth order.

---

## 4. Behavior / algorithms

### 4.1 `sliceSize(w, c)` — the instruction budget (the only RNG use)

With the M0 defaults `SizDepSlice=1`, `SlicePow=1` (M0 §9; `04-population-dynamics.md`
§1a–§1b), the size-dependent base collapses to the genome size:

```
base = c.size                              // SizDepSlice=1, SlicePow=1 ⇒ pow(size,1)=size
// RanSlicerQueue (SlicFixFrac=0, SlicRanFrac=2): uniform integer in [0, 2*base]
return w.rng.int(2 * base + 1)             // int(nExclusive) → [0, 2*base]  (integer)
```

- `w.rng.int(n)` returns an unbiased integer in `[0, n)` (rejection sampling, §[01]); with
  `n = 2·base + 1` the result is a uniform integer in the **inclusive** range `[0, 2·size]`.
  Mean `= size`, so the *average* budget equals the base — this is what preserves the
  size-neutral fitness regime while desynchronizing copy loops (M0 §9;
  `04-population-dynamics.md` §1b Notes).
- This `rng.int` call is the **only** stochastic draw in the whole scheduler. It happens
  **once per slice**, immediately before the slice runs, so replay order is fixed (C-DET).
- All integer (C-INT). `SlicePow==1` is deliberately special-cased to skip any `pow()`
  (Tierra's documented "speed hack") — but even conceptually there is no float here.

### 4.2 `runSlice(w)` — one whole slice, break-early on death

```
runSlice(world):
  c = world.slicer.cursor
  if c == null: return 0                    // empty population
  n = sliceSize(world, c)                    // single RNG draw for this turn
  ran = 0
  for i in 0 .. n-1:
     stepOne(world, c)                       // §[07]: fetch-decode-execute one instruction
     ran += 1
     if not c.alive: break                   // died mid-slice (reaper killed it) — stop clean
  advanceCursor(world.slicer, c)             // move cursor to c.slicerNext (if c still live)
  return ran
```

- **Break-early on mid-slice death.** A creature can die *during its own slice* — e.g. an
  allocation it triggers forces the reaper to make room and the head chosen to die is itself,
  or a fatal error path. `stepOne` never advances the loop past a dead creature: the loop
  checks `c.alive` after each instruction and stops. The slice ends cleanly; no further
  instructions run against freed soup.
- **Cursor after death.** If `c` died, `slicerRemove` (called by the reaper's `kill`) has
  already re-pointed the cursor onto `c`'s successor, so `advanceCursor` must be a no-op-safe
  operation: it only advances if `c` is still the cursor and still alive. (Concretely:
  `advanceCursor` reads the *current* cursor; if the reaper already moved it off `c`, the
  cursor is left where the reaper placed it.)
- **One instruction = one cycle.** Each `stepOne` bumps `world.cycles` (M0 §6). The slice
  contributes its executed-instruction count to the global clock; a size-0 draw contributes
  nothing (a legal, no-op slice — the cursor still advances).

### 4.3 `slicerAppend(q, c)` — newborn at tail (O(1))

```
slicerAppend(q, c):
  if q.cursor == null:                       // first creature: singleton ring
     c.slicerNext = c; c.slicerPrev = c
     q.cursor = c
  else:                                       // splice before cursor (== tail position)
     tail = q.cursor.slicerPrev
     tail.slicerNext = c;  c.slicerPrev = tail
     c.slicerNext = q.cursor;  q.cursor.slicerPrev = c
  q.length += 1
```

### 4.4 `slicerRemove(q, c)` — remove on death (O(1))

```
slicerRemove(q, c):
  if q.length == 1:                          // last one leaving
     q.cursor = null
  else:
     if q.cursor === c: q.cursor = c.slicerNext   // advance cursor OFF the dying node first
     c.slicerPrev.slicerNext = c.slicerNext
     c.slicerNext.slicerPrev = c.slicerPrev
  c.slicerNext = null; c.slicerPrev = null   // detach (INV-QUEUE: dead ⇒ not in queue)
  q.length -= 1
```

### 4.5 The tick loop — `World.run(n)` and `World.step()`

```
World.run(nInstructions):                    // executes WHOLE slices until the budget is met
  executed = 0
  while executed < nInstructions and slicer.length > 0:
     executed += runSlice(this)              // may overshoot by < sliceSize on the final slice
  return executed

World.step():                                // one instruction (debug / golden step tests)
  stepOne(this, <the current cursor creature, respecting its remaining slice>)
```

- `run(n)` runs **whole slices**: it never stops in the middle of a creature's slice, so it
  may execute slightly **more** than `n` instructions (up to the last slice's size). It stops
  as soon as (a) the cumulative executed count reaches `n`, or (b) the population is empty
  (`slicer.length == 0`). This is the batch entry point used by the Engine API and golden
  runs.
- `step()` executes **exactly one instruction** — the finest granularity, for debugging and
  golden single-step tests (M0 §9). It advances within the current creature's slice and lets
  the slicer advance the cursor when that slice is exhausted. `step()` and `run()` over the
  same total instruction count are consistent up to the whole-slice rounding of `run()`.

### 4.6 "CPU time = energy" and why size is not selected against

The slice budget is proportional to `size`, so a genome that is 2× larger receives, on
average, 2× the instructions per pass. A larger creature therefore takes *proportionally*
longer to copy itself but is *granted proportionally more* CPU to do it — the two cancel, and
per-unit-time reproductive rate is (to first order) **independent of size**. Without this,
smaller genomes would always out-replicate larger ones per unit wall-clock and size would
collapse under selection. Size-proportional slicing keeps size a **free** trait, preserving
the open-ended size/complexity dynamics Tierra is built to exhibit (M0 §9;
`04-population-dynamics.md` §1a Notes). CPU time is the scarce resource; the slicer is how it
is rationed.

---

## 5. Interconnections

- **Calls down:** `world.rng.int` (§[01], the one draw), `stepOne` (§[07] CPU exec cycle),
  and reads `creature.size`/`creature.alive`.
- **Called by:** `World.run`/`World.step` (§[00] hub, §[15] API). It is the "picks next"
  arrow in the system map (§[00]/2).
- **Enqueue path:** `divide` (§[08]) calls `slicerAppend` for each newborn as part of the
  same event that enqueues it in the reaper (§[10]) and fires the genebank birth hook (§[12]).
- **Dequeue path:** the reaper's `kill` (§[10]) calls `slicerRemove`; this is the sole way a
  creature leaves the slicer queue. The slicer never kills — it only *detects* mid-slice death
  via `c.alive` and stops the current slice.
- **Contracts crossed:** C-DET (single fixed-order RNG draw; intrusive-queue traversal),
  C-INT (integer budget), C-ID (birth-order == id order), and it maintains INV-QUEUE jointly
  with §[08]/§[10].

---

## 6. Determinism & edge cases

- **RNG order (C-DET):** exactly one `rng.int(2·size+1)` per slice, drawn *before* the slice
  executes. No other scheduler call touches `rng`. Two runs with the same descriptor draw the
  same sequence, so slice sizes — and therefore the whole trajectory — are bit-identical.
- **Empty population:** `cursor == null`; `runSlice` returns 0; `run(n)` exits its loop. No
  RNG draw is made when there is nothing to schedule.
- **Singleton ring:** a sole creature's `slicerNext`/`slicerPrev` both point to itself; the
  cursor never leaves it; `advanceCursor` is a self-loop; append/remove handle the 1↔0 and
  1↔2 transitions explicitly (§4.3/§4.4).
- **Size-0 slice:** `rng.int(2·size+1)` can legitimately draw 0 → the creature runs zero
  instructions this pass; the cursor still advances (fair round-robin; no starvation of
  others). This is expected jitter, not a bug.
- **Death mid-slice:** handled by the `c.alive` check (§4.2). Because `slicerRemove` advances
  the cursor off the dying node *before* unlinking, the round-robin continues from the correct
  successor with no skipped or double-visited creature.
- **Newborn mid-pass:** a daughter appended during the current pass sits at the tail (before
  the cursor), so it is not visited until the *next* pass — birth order is preserved and no
  creature is scheduled twice in one pass.
- **No floats anywhere (C-DET/C-INT):** base, bound, and draw are integers; `SlicePow==1`
  removes any `pow()`.

---

## 7. Fidelity notes

- **[CORE] `RanSlicerQueue` as the default scheduler.** `SliceStyle=2` is Tierra v6.02's
  shipped default (`soup_in.h:112`); we reimplement its exact behavior: round-robin traversal
  with a per-slice size of a uniform integer in `[0, 2·size]` (`SlicFixFrac=0`,
  `SlicRanFrac=2`), `SizDepSlice=1`, `SlicePow=1` ⇒ base `= size`
  (`04-population-dynamics.md` §1b).
- **[CORE] Size-proportional slicing** (`SizDepSlice=1`, `SlicePow=1`): preserves the
  size-neutral fitness regime (§4.6). Non-negotiable for faithful dynamics.
- **[MOD] Circular intrusive list + cursor** instead of Tierra's `cells[][]` arrays with
  `htis` self-pointers and sentinel cells `{0,0}`/`{0,1}`. Same O(1) semantics and identical
  ordering; implementation modernized to plain object links (justified by C-SNAP —
  everything stays on `World`/`Creature`, serializable).
- **[MOD] Deferred `SlicerQueue` (strict round-robin, `SliceStyle=0`)** — a special case of
  ours with `sliceSize = size` (no draw); trivial to add behind the config but not needed for
  M0 fidelity since `RanSlicerQueue` is the default.
- **[OPTIONAL] `SlicerPhoton` (`SliceStyle=1`)** — the spatial photon/energy scheduler
  (random-address selection, template-fit sizing). Off by default in Tierra; **deferred**
  (`04-population-dynamics.md` §1c, "Incidental / optional").
- **[OPTIONAL] Lazy-reap loop** inside the slicer (`repinst > RepInst·LazyTol`,
  `04-population-dynamics.md` §1e) is a **reaper** concern living in the slice loop; it is
  specified/owned by §[10], not here, and is an M1 pressure. M0's slicer only detects death,
  it does not initiate `REAP_LAZY`.
- **[OPTIONAL] Multi-CPU creatures** (Tierra's per-CPU inner loop in `TimeSlice`,
  `MaxCpuPerCell`) — M0 creatures are single-threaded; one `stepOne` per instruction.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/engine/test/09-slicer.test.ts`. IDs are
append-only.

- **SLICE-001** — Round-robin visits every live creature exactly once per pass, in **birth
  order** (ascending id), then returns to the first: over one full pass of `k` creatures, the
  cursor touches each of the `k` once before repeating.
- **SLICE-002** — `sliceSize` with `SizDepSlice=1`, `SlicePow=1` uses `base = c.size` and
  returns `rng.int(2·size + 1)`, i.e. a uniform integer in the inclusive range `[0, 2·size]`
  (never negative, never `> 2·size`).
- **SLICE-003** — Slice sizing is **deterministic from the seed**: two engines with the same
  seed produce the identical sequence of slice sizes; it is the **only** RNG use in the
  scheduler (draw count == slice count).
- **SLICE-004** — A creature that dies **mid-slice** ends its slice cleanly: no instruction is
  executed against it after `alive` goes false, and the cursor advances to the correct
  successor (no skipped or double-visited creature).
- **SLICE-005** — New creatures (from `divide`) **enter at the tail** (immediately before the
  cursor) and are therefore first scheduled on the *next* pass, preserving birth order;
  `slicerAppend`/`slicerRemove`/advance are each O(1) and keep INV-QUEUE (exactly one slicer
  position per live creature, none for the dead).
- **SLICE-006** — `World.run(n)` executes **whole slices** until the instruction budget is met
  or the population is empty: total executed ≥ `n` and overshoot < the final slice's size;
  `run` stops immediately when `slicer.length == 0`.
- **SLICE-007** — `World.step()` executes **exactly one** instruction (advancing within the
  current slice / advancing the cursor when exhausted) and is consistent with `run` up to
  whole-slice rounding.
- **SLICE-008** — A drawn slice size of **0** runs zero instructions yet still advances the
  cursor (no starvation, fair round-robin).
- **SLICE-009** — Over many passes a creature of size `2s` receives, on average, ~2× the
  instructions of a size-`s` creature (mean slice == size); size is **not** auto-selected
  against by the scheduler.

---

## 9. Open questions

1. **`step()` semantics across slice boundaries.** Should `step()` expose the *remaining*
   slice budget of the current creature (so a caller can single-step through exactly the same
   sequence `run` would produce), or re-draw a fresh slice each time it lands on a new
   creature? Proposal: `step()` tracks a `remainingInSlice` counter on the slicer so the RNG
   draw happens once per creature-turn exactly as in `run` — keeping `step`/`run` bit-identical
   (needed for golden single-step tests). Confirm.
2. **Cursor persistence in snapshots.** The cursor and any `remainingInSlice` must serialize
   (C-SNAP) so `restore` resumes mid-pass identically. Confirm the snapshot schema (§[14])
   carries the cursor creature id + remaining budget.
3. **Newborn same-pass visibility.** We place newborns at the tail (Tierra `EntBotSlicer`),
   so they wait for the next pass. Confirm no scenario needs same-pass execution of a daughter
   (M0: no).
