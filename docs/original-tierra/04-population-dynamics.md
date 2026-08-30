# Tierra v6.02 — Population Dynamics (Pass 2 Deep-Dive)

Reference doc for the scheduler ("slicer"), death process ("reaper"), disturbance,
and the reproduction life-cycle in Tom Ray's Tierra v6.02.
Source root: `reference/tierra-v6.02/tierra/`.

All line citations are against the shipped v6.02 sources. Cross-checked defaults are
from `soup_in.h` (the compiled-in defaults; a `soup_in` / `.soup` file can override
any of them at run time).

---

## Overview

Tierra is a CPU-time economy. Two queues govern who runs and who dies:

- **Slicer queue** — a *circular* doubly-linked list of living cells. Each pass the
  scheduler ("slicer") hands one cell a time-slice of virtual-CPU instructions, then
  advances to the next cell. This is the source of the CPU as a limiting resource.
- **Reaper queue** — a *linear* doubly-linked list, roughly age/error ordered. When
  memory ("the soup") fills, or on a periodic disturbance, or when a cell is unfit,
  the reaper kills cells from the **top** of this queue. This is the source of death.

The queues are threaded through fields of each cell's `q` struct: `n_time`/`p_time`
(slicer), `n_reap`/`p_reap` (reaper), plus `htis` ("here this is" — the cell's own
`{array, index}` self-pointer). See `tierra.h:622-627`. The linkage layout and the
reserved sentinel cells are documented at the top of `queues.c:13-47`.

The central loop is `life()` (`tierra.c:161`), which repeatedly calls
`(*slicer)()` then `ReapCheck()` (`tierra.c:185-186`). `slicer` is a function
pointer selected once at setup from `SliceStyle`.

**Reserved cells.** `cells[0][0]` and `cells[0][1]` are the reaper-queue sentinels
`TopDummy` / `BottomDummy` (top-of-queue sits above the next-to-die; bottom-of-queue
below the furthest-from-death). The slicer queue never uses `{0,0}` or `{0,1}`; real
cells start at `cells[0][2]` (`queues.c:40-46`, `bookeep.c:226`).

---

## 1. SLICER (Scheduler)

Three slicer variants exist. All live in `slicers.c`; the setup code binds the global
function pointer `slicer` to one of them based on `SliceStyle` (`tsetup.c:3213-3221`):

| `SliceStyle` | Function          | Nature                    |
|--------------|-------------------|---------------------------|
| 0            | `SlicerQueue`     | strict round-robin        |
| 1            | `SlicerPhoton`    | random pick + photon energy |
| **2**        | **`RanSlicerQueue`** | round-robin, randomized slice size — **shipped default** |

Default is **`SliceStyle = 2` → `RanSlicerQueue`** (`soup_in.h:112`,
`tsetup.c:3220-3221`).

### 1a. `SlicerQueue` — strict round-robin (SliceStyle = 0)

- **What:** Deterministic round-robin. The current cell `ce` runs a fixed (or
  size-dependent) slice, then the queue advances one cell.
- **How:** If `!NumCells` return. Slice size: if `SizDepSlice`, `size = pow(ce->mm.s,
  SlicePow)`; else `size = SliceSize`. Call `TimeSlice(size)`, then
  `IncrSliceQueue()` to move `ce` to `n_time`. After advancing it runs the **lazy
  reap loop** (see below).
- **Params(values):** `SizDepSlice=1`, `SlicePow=1`, `SliceSize=25`.
- **Code:** `slicers.c:147-169`.
- **Notes:** With defaults `SizDepSlice=1, SlicePow=1`, size collapses to `ce->mm.s`
  (mother memory size in instructions), i.e. bigger creatures get proportionally more
  CPU — the classic size-neutral fitness regime.

### 1b. `RanSlicerQueue` — randomized round-robin (SliceStyle = 2, DEFAULT)

- **What:** Same round-robin traversal as 1a, but the per-slice count is jittered so
  cells don't stay phase-locked.
- **How:** Base slice as in 1a (`SizDepSlice` → `base = ce->mm.s`, or `PExeSegSiz`
  when compiled with `EXEINSTSIZTIMSLC`; power via `SlicePow`; else `SliceSize`).
  Then randomize:
  `size = (SlicFixFrac*size) + (tlrand() % ((SlicRanFrac*size)+1))`
  (`slicers.c:199-200`). Call `TimeSlice`, `IncrSliceQueue`, then the lazy reap loop.
- **Params(values):** `SlicFixFrac=0.0`, `SlicRanFrac=2.0`, `SizDepSlice=1`,
  `SlicePow=1`, `SliceSize=25`.
- **Code:** `slicers.c:178-216`.
- **Notes:** With the default `SlicFixFrac=0, SlicRanFrac=2`, the actual slice is a
  uniform random integer in `[0, 2*size]`, so it *averages* `size` (= `ce->mm.s`) but
  varies each pass. This desynchronizes the population's copy loops. `SlicePow==1.0` is
  a documented "speed hack" that skips the `pow()` call.

### 1c. `SlicerPhoton` — energy / photon model (SliceStyle = 1)

- **What:** Non-queue scheduler. Selects the executing cell **at random by soup
  address**, and sizes the slice by how well a "photon" template matches the code at
  that address ("chlorophyll" energy capture — a spatial resource model).
- **How:** Pick a random soup address `a` that is not free (`tlrand()%SoupSize`, retry
  while `IsFree(a)`); resolve which cell owns it via `WhichCell`. Compute
  `size = PhotonSlide(a, PhotonInst, PhotonSize, PhotonWidth)` — the best fit-count of
  the photon template over a search window; then `size = 10 * pow(size, PhotonPow)`.
  If `SizDepSlice`, further scale by `(ce->mm.s / AverageSize)` (raised to `SlicePow`
  if `!=1`). Call `TimeSlice(size)`.
  - `PhotonFit` (`slicers.c:53-73`): fit-count of the template at one address over all
    ploidy tracks.
  - `PhotonSlide` (`slicers.c:86-99`): slides the template across a window of width
    `PhotonWidth` centered on `a`, returns best fit.
  - `PhotonTranslate` (`slicers.c:111-138`): converts the mnemonic string `PhotonWord`
    into an instruction template `PhotonInst` (done once at setup; `PhotonSize =
    strlen(PhotonWord)` — `tsetup.c:3213-3215`).
- **Params(values):** `PhotonPow=1.5`, `PhotonWidth=8`, `PhotonWord="chlorophill"`
  (→ `PhotonSize=11`), `SizDepSlice=1`, `SlicePow=1`.
- **Code:** `SlicerPhoton` `slicers.c:18-41`; helpers `slicers.c:53-138`.
- **Notes:** No queue advance and no lazy-reap loop here — cell selection is purely by
  random address, so CPU goes to whoever occupies more soup and matches the photon
  best. This is Ray's "photosynthesis / spatial energy" experiment, off by default.

### 1d. `TimeSlice` — the central execution loop

- **What:** Runs `size_slice` instructions for **each CPU** of the current cell.
- **How:** `ce->c.ib += size_slice` accumulates the instruction budget; the outer
  `for (is.ts = ce->c.ib; is.ts > 0; )` loop steps the slice, the inner
  `for (c = ce->c.n-1; c>=0; c--)` loop iterates the cell's CPUs (multi-threaded
  creatures). Per instruction: `FetchDecode()`, dispatch `(*id[di].execute)()`,
  `Deconstruct`, then `IncrementIp()` and `SystemWork()`. Handles `CellHalt`,
  `CpuHalt`, `TierraWait`, execution-protection (`PrivExec`), and thread bookkeeping.
- **Code:** `tierra.c:231-403`. Called from every slicer variant.
- **Notes:** `SystemWork()` (`tierra.c:671`) is post-instruction bookkeeping: bumps
  `ce->d.inst`/`ce->d.repinst`, and — critically for the reaper — on a flaw
  (`ce->c.c->fl.E`) increments `ce->d.flags` (the error count) and calls `UpRprIf(ce)`
  to bubble the cell **up** the reaper queue toward death (`tierra.c:677-681`).
  `SystemWork` also advances the global clock `InstExe` and can trigger `DropDead`
  (`tierra.c:707-713`).

### 1e. Lazy reap loop (inside SlicerQueue / RanSlicerQueue)

- **What:** Kills cells that execute far more than the average instructions-per-
  replication without dividing — "non-reproducing / lazy" cells.
- **How:** After `IncrSliceQueue`, while the just-selected cell has run
  `ce->d.repinst > RepInst * LazyTol` (and `NumCells > NumCellsMin` and `LazyTol`),
  call `ReapCell(ce, REAP_LAZY)`. `RepInst` (avg instructions per replication) is
  recomputed each million-instruction interval in `CalcTimeSoup` (`bookeep.c:558`).
- **Params(values):** `LazyTol=5`, `NumCellsMin=1`.
- **Code:** `slicers.c:158-168` (queue), `slicers.c:205-215` (random).
- **Notes:** `LazyTol=0` disables the mechanism. This is the main pressure against
  parasites/junk that consume CPU but never reproduce.

### Slicer queue operations

- **`IncrSliceQueue`** (`queues.c:52-57`): `ce = cells[ce->q.n_time.a][.i]`; then
  `while (!ce->ld) RmvFrmSlicer(ce)` — skip/evict dead or dormant cells.
- **`DecrSliceQueue`** (`queues.c:62-66`): symmetric, moves to `p_time`. Used by
  `ReapCell` to pull the mother out cleanly (`tierra.c:1000`).
- **`EntBotSlicer`** (`queues.c:73-90`): splice a new cell in *before* the current
  slice cell (its "bottom"), so a freshly started daughter runs after existing cells.
  Manipulates `n_time`/`p_time` of `nc`, `tc`(=ce), and the previous cell.
- **`RmvFrmSlicer`** (`queues.c:263-284`): unlink from `n_time`/`p_time`; if removing
  `ce`, advance `ce` to `n_time`; reset the cell's links to self (`htis`).

---

## 2. REAPER (Death)

### 2a. The reaper queue — structure & ordering

- **What:** A linear doubly-linked list of all living cells, threaded on
  `q.n_reap`/`q.p_reap`. `TopReap` points at the cell nearest death; `BottomReap` at
  the cell furthest from death. New cells enter at the **bottom** (youngest, safest);
  the reaper kills from the **top**.
- **How (ordering):** Roughly age-ordered because cells enter at the bottom and drift
  up as older cells above them die. Position is *perturbed by fitness*: on an error a
  cell moves up (closer to death), and on a successful `mal`/`divide` it moves down
  (`UpRprIf`/`DownReperIf`). Ordering key is `d.flags` (cumulative error count).
- **Params:** sentinels `TopDummy=cells[0][0]`, `BottomDummy=cells[0][1]`.
- **Code:** layout `queues.c:13-47`; entry `EntBotReaper` `queues.c:193-219`.
- **Notes:** `EntBotReaper` special-cases `NumCells==1` (first cell links to both
  dummies and becomes `TopReap`).

### 2b. Queue movement — what moves a cell, and why

- **`UpReaper`** (`queues.c:97-124`): swap a cell one position toward `TopReap`
  (toward death). Six-pointer relink of the cell, its neighbors, and `Top`/`Bottom`.
- **`DownReaper`** (`queues.c:131-159`): swap one position toward `BottomReap`
  (away from death).
- **`UpRprIf`** (`queues.c:168-172`): move up **iff** `cp->d.flags >=` the flags of
  the cell above it. Called from `SystemWork` on every flawed instruction
  (`tierra.c:678-680`) — so error-prone code climbs toward the reaper.
- **`DownReperIf`** (`queues.c:181-185`): move down **iff** `cp->d.flags <=` the flags
  of the cell below. Called on a successful `mal` (`memalloc.c:367`) and at the split
  step of `divide` (`instruct.c:2251`) — fecund cells sink away from death.
- **`RmvFrmReaper`** (`queues.c:226-256`): unlink; fix `Top`/`Bottom` if it was either.
- **Notes:** Net effect — **errors push you toward death; reproduction pulls you away.**
  There is no direct age counter used for ordering; age is implicit in queue position.

### 2c. `reaper()` — choose a victim and kill it

- **What:** Decide which cell in the reaper queue to kill, then call `ReapCell`.
- **How:** `reaper(ex, sad, extrmcod)`:
  1. If `NumCells <= NumCellsMin` → return 1 (refuse, no kill).
  2. **Targeted search (mal only):** if `MalReapTol` and `sad` is a valid soup
     address, walk from `TopReap` looking for the oldest cell whose memory lies within
     `MalLimit` of the suggested address `sad` (so `mal` frees space near where it
     wants to allocate). Skips the currently-executing cell if `ex`.
  3. **Default pick:** otherwise pick from the top `reap_range = ReapRndProp*NumCells`
     cells: if `reap_range < 2`, take `TopReap`; else take a random cell among the top
     `reap_range` (`j = tlrand()%reap_range`).
  4. If the chosen cell is the one executing now, reap an adjacent cell instead
     (never reap yourself mid-instruction).
  5. If it is a real cell (`cr->mm.s`), possibly recompute `DistNext` (disturbance
     scheduling, see §3), then `ReapCell(cr, extrmcod)` and return 0; else return 1.
- **Params(values):** `NumCellsMin=1`, `MalReapTol=1`, `ReapRndProp=0.0`,
  `MalTol=5` (→ `MalLimit = MalTol*AverageSize`, `bookeep.c:1228`).
- **Code:** `tierra.c:845-939`.
- **Notes:** With the default `ReapRndProp=0.0`, `reap_range` is 0/<2, so the default
  victim is deterministically **`TopReap`** (the oldest/most-flawed). `ReapRndProp>0`
  adds stochasticity to which top-N cell dies. `MalReapTol=1` means a soup-full `mal`
  preferentially reaps an old cell near the requested address rather than strictly the
  queue top.

### 2d. `ReapCell()` — actually kill a cell

- **What:** Free the cell's mother (and any daughter) memory, remove it from both
  queues, and do death bookkeeping.
- **How:** Validate; save thread-analysis data with the termination code
  (`btad_extrnterm = extrmcod`); `MemDealloc` + `InitDeadMem` the mother block; free
  any daughter (clean daughter CPU, `MemDealloc` daughter block); if the victim is the
  running cell, zero the slice, `DecrSliceQueue`, set `CellHalt=1`; then
  `RmvFrmSlicer`, `RmvFrmReaper`, and `ReapBookeep`.
- **Code:** `tierra.c:949-1006`.
- **Notes:** `DeadMemInit` controls whether freed soup is zeroed or randomized
  (`InitDeadMem`, `memalloc.c:381`).

### 2e. `ReapBookeep()` — death statistics & gene-bank

- **What:** Death-side bookkeeping.
- **How:** Log 'd' to disk (`OutDisk`); unless the cell was an ejected daughter
  (`ld==2`), accumulate `FecunditySum += fecundity`, `AgeSum += inst`, `DeathNum++`;
  call `ReapGenBook` if gene-banking; `NumCells--`; `InitCell`. If the population hits
  zero it reinitializes free memory and the cell arrays and resets
  `ce=BottomReap=TopReap=cells[0][2]`. Sets `reaped=1`.
- **Code:** `bookeep.c:170-233`.

### 2f. `ReapCheck()` — disturbance trigger (see §3)

- **Code:** `tierra.c:757-783`. Called after every slice in `life()`.

### Termination codes

Set into `mtad_extrnterm` at reap time; passed as `extrmcod` (`tierra.h:71-81`):

| Code | Value | Meaning | Where raised |
|------|-------|---------|--------------|
| `REAP_LAZY`          | 1   | non-reproducing, exceeded `LazyTol` | `slicers.c:167,214` |
| `REAP_DISTURB`       | 2   | periodic disturbance                | `tierra.c:781` |
| `REAP_HALT`          | 3   | halt of last CPU                    | (halt handling) |
| `REAP_NON_NET_EJECT` | 4   | non-network ejection of daughter    | `instruct.c:2275` |
| `REAP_SOUP_FULL`     | 5   | soup full during `mal`              | `memalloc.c:312…353`, `tierra.c:1118` |
| **NET-only** | | | |
| `REAP_APOCALYPSE`    | 101 | mass kill (network apocalypse)      | `tierra.c:806` |
| `REAP_SUBNET`        | 102 | surf to a different subnet          | NET |
| `REAP_SURF`          | 103 | normal surf (migrate off node)      | NET |
| `REAP_DIVIDE`        | 104 | remote divide (daughter ejected)    | `instruct.c:2266` |

### Reaper tuning knobs (values from `soup_in.h`)

- **`LazyTol = 5`** (`soup_in.h:77`): kill a cell once `repinst > RepInst*LazyTol`.
  0 = disabled. Governs §1e.
- **`ReapRndProp = 0.0`** (`soup_in.h:103`): random fraction of the top of the reaper
  queue to pick a victim from. 0 → always `TopReap`. Governs §2c step 3.
- **`EjectRate = 50`** (`soup_in.h:61`): 1-in-`EjectRate` daughters are randomly
  ejected/killed on divide (`REAP_NON_NET_EJECT` non-net; ejection to network in NET).
  0 = disabled. See `instruct.c:2086,2274`.
- **`DropDead = 5`** (`soup_in.h:59`): if no cell divides for `DropDead` million
  instructions, the whole run aborts (`tierra.c:711`, keyed on `LastDiv`). Sanity kill
  for a dead soup, not a per-cell reap.
- Related: **`MalReapTol=1`**, **`MalTol=5`**, **`NumCellsMin=1`**.

---

## 3. DISTURBANCE (periodic mass extinction)

- **What:** Periodic culls of a proportion of the population, to keep the soup churning
  and prevent stagnation / crystallization into one genotype.
- **How:** In `ReapCheck()` (`tierra.c:757-783`): if `DistFreq < ~0` or not yet
  `reaped` or `DistNext` is unset → return. Else compute `dtime = InstExe - DistNext`;
  when due (`dtime > 0`): record `Disturb = InstExe`, clear `DistNext`, compute
  `t = DistProp * NumCells`, clamp so `t < NumCells - NumCellsMin`, then call
  `reaper(0, -1, REAP_DISTURB)` `t` times. The *next* disturbance time is set inside
  `reaper()` (`tierra.c:915-922`): after a disturbance-era reap, `DistNext` is set
  `DistFreq * (time since last Disturb)` into the future — i.e. the interval is a
  multiple of the population's recovery time, not a fixed clock.
- **Params(values):** `DistFreq = 0.3` (`soup_in.h:55`) — factor of recovery time
  between disturbances; `DistProp = 0.2` (`soup_in.h:56`) — fraction of population
  killed each disturbance; `DistNext = {0,0}` initial (`soup_in.h:119`).
- **Code:** trigger `tierra.c:771-782`; rescheduling `tierra.c:915-922`.
- **Notes:** Negative `DistFreq` disables disturbance entirely. Because the interval is
  proportional to recovery time, a faster-recovering soup gets disturbed more often.
  `DistProp=0.2` ⇒ ~20% of cells die per event (as `REAP_DISTURB`, victims chosen by
  `reaper` from the top of the queue). The NET build additionally has `Apocalypse()`
  (`tierra.c:790-830`), a full-population wipe.

---

## 4. REPRODUCTION LIFE-CYCLE

A creature reproduces via three phases: **allocate** daughter memory (`mal`), **copy**
its genome into it (a loop of `mov` instructions), then **divide** to give the daughter
an independent CPU and cut it loose. The instruction opcodes are `malchm` and `divide`
in `instruct.c`.

### 4a. `mal` — allocate daughter memory

- **What:** Reserve a block of soup for the daughter and record it as `ce->md`
  (mother's daughter-memory).
- **How:** `malchm()` (`instruct.c:2029-2050`) validates requested size
  (`MinCellSize <= sval < SoupSize`), then calls `mal(&addr, size, mode)`
  (`memalloc.c:286-369`). `mal` rejects sizes `<=0`, `== ce->md.s`, or
  `> MaxMalMult*ce->mm.s`; applies `flaw()` to the size (or forces `ce->mm.s` if
  `MalSamSiz`); frees any pre-existing daughter block; then `MemAlloc` by mode
  (first-fit / better-fit / random / mother-pref / ax-pref / stack-pref / addr-pref).
  On soup-full, it loops calling `reaper(1, sad, REAP_SOUP_FULL)` to make room. On
  success sets `ce->md.p`, `ce->md.s`, clears the error flag, and `DownReperIf(ce)`
  (moves the now-productive mother away from death).
- **Params(values):** `MinCellSize`, `MinGenMemSiz`, `MalTol=5`, `MalReapTol=1`,
  `MaxMalMult`, `MalSamSiz`.
- **Code:** `instruct.c:2029-2050`, `memalloc.c:286-369`.

### 4b. Copy loop — genome copy & metabolism tracking (`mov`)

- **What:** The creature copies its genome byte-by-byte into the daughter block.
- **How:** Each `movdi/movid` write (`instruct.c` movid family, e.g. `:1670-1710`)
  that lands **inside** the daughter block updates the daughter-fill telemetry:
  `MovOffMin`/`MovOffMax` (lowest/highest daughter offset written) and increments
  `ce->d.mov_daught` (count of daughter bytes written). This is Tierra's notion of
  *metabolic work* — the effort spent building the daughter.
- **Code:** `instruct.c:1678-1687` (and the parallel block `:1889-1895`).
- **Notes:** `mov_daught` and the `MovOff*` span are exactly the quantities `divide`
  later checks to decide whether the daughter is "filled enough" to be born.

### 4c. `divide` — cell fission

- **What:** Give the daughter its own CPU and detach it as an independent cell.
- **How:** `divide()` (`instruct.c:2059-2299`) runs in up to three modes
  (`is.mode` = 0 create CPU / 1 start CPU / 2 split), typically issued as a short
  sequence. Guards first (`instruct.c:2063-2069`):
  - `DGenMemSiz = MovOffMax - MovOffMin + 1` (span of daughter written).
  - `Thresh = ce->md.s * MovPropThrDiv * PLOIDY` — the minimum fill.
  - Fail (set `fl.E`, abort) if `md.s < MinCellSize`, `DGenMemSiz < MinGenMemSiz`,
    `DGenMemSiz < Thresh`, or `mov_daught < Thresh`. **⇒ You cannot divide until you
    have actually copied at least `MovPropThrDiv` of the daughter.**
  - If `DivSameSiz`: reject unless `ce->mm.s == ce->md.s`. If additionally
    `DivSameGen`: reject unless the daughter genome is byte-identical to the mother
    (`IsSameGen`). (`tsetup.c:3026-3027`: setting `DivSameGen` forces `DivSameSiz=1`.)
  - Mode 0/1 allocate & initialize the daughter's CPU(s) (up to `MaxCpuPerCell`),
    copy the mother's registers, enter the daughter into the slicer queue via
    `EntBotSlicer`.
  - Mode 2 (`instruct.c:2165-2282`): `GeneticOps()`, then finalize — enter daughter
    into **both** queues (`EntBotSlicer` + `EntBotReaper`, `:2243-2244`), clear
    `ce->md`, `DownReperIf(ce)`, and `DivideBookeep(ce, nc, index)`. Optional random
    ejection (`EjectRate`) reaps the daughter as `REAP_NON_NET_EJECT`.
- **Params(values):** `MovPropThrDiv = 0.7` (`soup_in.h:93`), `MinCellSize`,
  `MinGenMemSiz`, `MaxCpuPerCell = 16` (`soup_in.h:85`), `DivSameSiz = 0`,
  `DivSameGen = 0` (`soup_in.h:57-58`), `EjectRate = 50`.
- **Code:** `instruct.c:2059-2299`.
- **Notes:** `MaxCpuPerCell` caps threads per creature (`ce->c.n >= MaxCpuPerCell`
  guard at `instruct.c:1090`). `DivSameSiz`/`DivSameGen` are experiment switches to
  freeze size/genome evolution; both off by default.

### 4d. `DivideBookeep` — birth statistics, gene-bank, breed-true

- **What:** Record a successful division: update fecundity, genotype identity, birth
  counters, and per-daughter metabolic data.
- **How:** (`bookeep.c:26-162`) sets `LastDiv = InstExe`; on the mother's *first*
  clean replication records metabolic snapshot `d.d1` (flags, inst, instP,
  mov_daught). `mc->d.fecundity++`. If gene-banking: test whether the daughter
  **breeds true** — same size, same gene-memory span, and `IsSameGen` genome equal to
  mother; if so mark `nc->d.d1.BreedTrue = mc->d.d1.BreedTrue = 1`, inherit
  parent/genotype id; else register a **new genotype** (`CheckGenotype`, new label,
  `origpop++`). Increments `RepNum`, `BirthNum`; stamps `birthtime`; bumps
  `mc->d.repinst`, accumulates `RepInstEffSum`/`RepInstSum`, then **resets the
  mother's per-replication counters** (`repinst = mov_daught = mut = MovOffMin =
  MovOffMax = 0`). Logs 'b' to disk.
- **Code:** `bookeep.c:26-162`; breed-true test `bookeep.c:52-65`.
- **Notes on Metabolism / BreedTrue:** `Metabolism` (`genebank.h:45-52`, fields
  `flags`, `inst`, `instP`, `mov_daught`, `BreedTrue`) is per-daughter metabolic data
  (`d1`, `d2`) stored on the genotype. `BreedTrue=1` means that daughter was
  genetically identical to the parent — used to distinguish true-breeders from mutant
  offspring in the gene bank (`rambank.c:136`, `arg.c:179,442`).

### 4e. Resetting `RepInst` / feedback into the slicer & reaper

- `RepInst` (average instructions-per-replication) is recomputed each million-
  instruction interval in `CalcTimeSoup` (`bookeep.c:545-590`) from `RepInstSum /
  RepNum`; if there were no replications it is pinned to `LazyTol*10000`. This value
  feeds directly back into the **lazy-reap** test (§1e) — the population's own
  reproductive rate sets the bar a cell must beat to avoid `REAP_LAZY`.

### Fecundity queue (`q.h_fecu` / `q.l_fecu`)

- **What:** Struct fields `CellInd h_fecu` (next higher in fecundity queue) and
  `l_fecu` (next lower) exist on every cell (`tierra.h:626-627`), intended as a
  third queue ordering cells by fecundity.
- **State in v6.02:** **Declared but effectively vestigial** — no `.c` code in the
  shipped tree links, walks, or reaps by `h_fecu`/`l_fecu` (a grep across
  `tierra/*.c` finds only the struct declaration). Fecundity itself lives in
  `ce->d.fecundity` and drives death indirectly through error-count reaper ordering
  (`UpRprIf`/`DownReperIf`) and the lazy-reap test, **not** through this queue.
- **Code:** declaration `tierra.h:626-627`.

### `LifeCycFrct`

- **What:** `LifeCycFrct = -1.0` (`soup_in.h:366`) — a *thread/code-analysis* threshold
  (fraction of executed instructions `taev_instP`), not a core reproduction control.
- **How:** Only referenced in `thrdana.c` (e.g. `thrdana.c:1494-1502`): when `>= 0`, a
  thread whose executed-instruction ratio meets `LifeCycFrct` is flagged as having
  completed a "life cycle" for profiling/analysis output. Default `-1.0` = disabled.
- **Code:** `thrdana.c:1452,1494-1501,2961,3208,3350,3746`; setup `tsetup.c:1025-1035`.
- **Notes:** Does **not** gate real division; it only shapes thread-analysis reports.
  Included here because the prompt asked, but it is incidental to population dynamics.

### `MateSizeEp`

- **What:** `MateSizeEp = 1` (`soup_in.h:84`) — size epsilon for the sexual/crossover
  genetic operator (`CroInsSamSiz`): a cell may mate with a partner whose size is
  within `± MateSizeEp`.
- **How:** Used by `FindRandCellOfSize(ce, DaughtSize, MateSizeEp)`
  (`operator.c:300`) when selecting a mate during `GeneticOps` at divide.
- **Code:** `operator.c:300`; setup `tsetup.c:1210-1220`.

---

## Requirement vs incidental

**Core requirement (the actual population-dynamics engine — reimplement these):**

- The **two queues**: circular slicer (`n_time`/`p_time`) and linear reaper
  (`n_reap`/`p_reap`) with `TopReap`/`BottomReap` sentinels and bottom-entry / top-exit
  semantics. (`queues.c`)
- The **`life()` loop**: `(*slicer)()` then `ReapCheck()` each pass. (`tierra.c:161-219`)
- A **slicer** that hands each cell a CPU slice and advances the queue, with
  size-dependent slice sizing (`SizDepSlice`/`SlicePow` → slice ∝ `mm.s`). The
  randomized variant (`RanSlicerQueue`, `SliceStyle=2`) is the shipped default and the
  canonical Tierra scheduler. (`slicers.c`)
- **`TimeSlice`** executing `size` instructions per CPU per cell. (`tierra.c:231`)
- The **reaper**: kill from `TopReap` when soup fills; reproduction moves you down
  (`DownReperIf`), errors move you up (`UpRprIf`). (`tierra.c:845`, `queues.c`)
- **Lazy reaping** (`LazyTol` vs `RepInst`) and the `RepInst` feedback loop. (§1e, §4e)
- **Reproduction life-cycle**: `mal` → copy loop tracking `mov_daught`/`MovOff*` →
  `divide` gated by `MovPropThrDiv`; `DivideBookeep` for fecundity/genotype/birth
  stats. (`instruct.c`, `bookeep.c`)
- **Disturbance** as the mass-extinction churn (`DistFreq`/`DistProp`/`DistNext`).
  (`tierra.c:757-783`)

**Incidental / optional / experiment switches (safe to omit in a minimal model):**

- **`SlicerPhoton`** (`SliceStyle=1`) — the photon/energy spatial-resource experiment
  (`PhotonPow`/`PhotonWidth`/`PhotonWord`). Off by default.
- **`DivSameSiz` / `DivSameGen`** — freeze-evolution experiment switches (both 0).
- **`EjectRate`, `MateSizeEp`** — random ejection and the sexual/crossover operator.
- **`DropDead`** — a whole-run watchdog abort, not a per-cell reap.
- **`MalReapTol` targeted reaping** — a locality optimization for `mal`; plain
  top-of-queue reaping is the baseline.
- **`h_fecu`/`l_fecu` fecundity queue** — declared but unused in v6.02.
- **`LifeCycFrct`, Metabolism `d1/d2`, `BreedTrue`, thread-analysis** — instrumentation
  / gene-bank telemetry, not mechanics.
- **NET-only paths**: `Apocalypse`, `REAP_SUBNET/SURF/DIVIDE`, migration/ejection to
  other nodes, `EXEINSTSIZTIMSLC` (`PExeSegSiz`) alternate slice basis.

Defaults quoted throughout are the compiled-in `soup_in.h` values; a run's `soup_in`
file overrides them (parsed in `tsetup.c`).
