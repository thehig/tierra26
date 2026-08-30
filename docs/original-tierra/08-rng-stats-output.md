# Tierra v6.02 — RNG, Statistics, and Output

Source: Tom Ray's Tierra v6.02, `reference/tierra-v6.02/tierra/`. This document
describes the pseudo-random number generator, the per-million-instruction
statistics machinery, and the disk/histogram output subsystem. All citations are
`file:line` into the reference tree. This is a faithful description of the
original code; no comparison to any reimplementation is made.

---

## Overview

Tierra runs a virtual CPU over a "soup" of self-replicating machine-code
creatures. Three orthogonal support subsystems are covered here:

1. **RNG** (`trand.c`, macros in `tierra.h`) — a subtractive/shuffle generator
   adapted from *Numerical Recipes in C* `ran2`-style code. A single `double`
   generator `tdrand()` returns uniform deviates in `[0,1)`; typed integer
   variants are macros that scale `tdrand()` into signed/unsigned ranges. All
   biological events (mutation sites, flaws, crossover points, reaper choices)
   consume this stream, so the algorithm and seeding are load-bearing for
   reproducibility.

2. **Statistics** (`bookeep.c`) — every million executed instructions the main
   loop calls `stats()` then `plan()`. These rebuild a genotype list from the
   soup, compute averages (population, size, fecundity, age), maxima
   (`MaxPop`, `MaxMemry`), and generation counts, then reset the per-interval
   accumulators. Birth/death accounting is threaded through `DivideBookeep()`
   and `ReapBookeep()`.

3. **Output** (`bookeep.c` `OutDisk()`, `ttools.c` histograms, `tsetup.c`
   `WriteSoup`/`SavDynMem`) — a per-event birth/death log written to `break.N`
   files, periodic full-state snapshots (`soup_out`, `core_out`), and on-screen
   histograms (size / genotype / memory / efficiency). A CPU-load governor
   (`tierra.c`, `frontend.c`) throttles the process via nice value and sleeps.

The core time unit is `InstExe`, an `Event {m, i}` counting millions (`.m`) and
units (`.i` in `[0, 10^6)`) of executed instructions; `.i` rolls into `.m` in
`SystemWork()` (`tierra.c:707`), which is where `stats()`/`plan()`/`SaveFreq`
fire.

---

## 1. RNG

### 1.1 `tdrand()` — the core generator

**What.** Returns a uniform `double` deviate in `[0.0, 1.0)`. This is the single
primitive from which every other random value derives.

**How.** It is a **three-stream linear-congruential subtractive/shuffle
generator** (adapted from *Numerical Recipes in C*, `ran1`-family). State is:

- `RandIx1, RandIx2, RandIx3` — three LCG state words (`globals.h:429`).
- `TrandArray[98]` — a shuffle table; entries `[1..97]` are used
  (`globals.h:430`).

Three independent LCGs advance each call, using the constants defined at the top
of `trand.c` (`trand.c:12-22`):

| Stream | Modulus (M) | Multiplier (IA) | Increment (IC) |
|--------|-------------|-----------------|----------------|
| 1 | `M1 = 259200` | `IA1 = 7141` | `IC1 = 54773` |
| 2 | `M2 = 134456` | `IA2 = 8121` | `IC2 = 28411` |
| 3 | `M3 = 243000` | `IA3 = 4561` | `IC3 = 51349` |

`RM1 = 1/M1`, `RM2 = 1/M2` are the reciprocal scale factors.

Per call (`trand.c:62-78`):

1. Advance streams 1 and 2:
   `RandIx1 = (IA1*RandIx1 + IC1) % M1`,
   `RandIx2 = (IA2*RandIx2 + IC2) % M2`.
2. Advance stream 3: `RandIx3 = (IA3*RandIx3 + IC3) % M3`.
3. Derive a shuffle index `j = 1 + (97*RandIx3)/M3`, giving an integer in
   `[1,97]`. A guard raises fatal `FEError(-1800)` if `j` escapes `[1,97]`
   ("This cannot happen") (`trand.c:71-74`).
4. Return `temp = TrandArray[j]` (the previously stored entry), then **refill**
   that slot with a freshly combined deviate:
   `TrandArray[j] = (RandIx1 + RandIx2*RM2) * RM1` — low-order piece from
   stream 1, high-order jitter from stream 2 (`trand.c:75-76`).

The shuffle (stream 3 selecting which stored value to emit) decorrelates the LCG
output and lengthens the period. This is a *subtractive/shuffle* design in the
sense that the returned value is a table entry chosen by an independent stream,
not the raw LCG output.

**Params (values).** M1/M2/M3, IA1/IA2/IA3, IC1/IC2/IC3 as tabulated above;
table size 98 (indices 1–97 live).

**Code.** `trand.c:62-78`; constants `trand.c:12-22`; state `globals.h:429-430`.

### 1.2 `tsrand(seed)` — seeding

**What.** Initializes the three LCG states and fills the shuffle table.

**How** (`trand.c:31-53`):

1. `RandIx1 = (IC1 + seed) % M1`, then advanced once more; used to seed
   `RandIx2 = RandIx1 % M2`; advanced again to seed `RandIx3 = RandIx1 % M3`.
   So all three streams derive deterministically from the single `seed`.
2. On Metrowerks (`__MWERKS__`) only, negative indices are flipped positive
   (`trand.c:40-47`).
3. Loop `j = 1..97` advancing streams 1 and 2 and storing
   `TrandArray[j] = (RandIx1 + RandIx2*RM2) * RM1` (`trand.c:48-52`). Stream 3
   is **not** pre-advanced here; it begins fresh in `tdrand()`.

**Seeding policy / `seed == 0`** (`tsetup.c:2922-2934`). If the configured
`seed` is 0, it is replaced by wall-clock time (`seed = tietime(NULL)`), then
`tsrand(seed)` is called and a fresh `seed = tlrand()` is drawn (a
time-derived random seed). For a resumed (not new) soup this is repeated to
obtain `lrandval`. For a `new_soup`, `tsrand(seed)` is called and the chosen
`seed` is printed to the screen so a run can be reproduced by supplying that
exact seed. Thus **seed 0 = non-reproducible time-based**; any nonzero seed is
fully reproducible.

**Params.** `seed` (I32s). Config key handled in `tsetup.c` alongside other
soup parameters.

**Code.** `trand.c:31-53`; seeding call site `tsetup.c:2922-2934`.

### 1.3 Typed variants (macros)

All are preprocessor macros in `tierra.h` (`tierra.h:291-315`) that scale the
`double` from `tdrand()` into an integer range. `X_MAX` are the platform integer
limits.

| Macro | Type | Range returned |
|-------|------|----------------|
| `tuintrand()` | `unsigned int` | `[0, INTU_MAX]` (`tierra.h:291`) |
| `tintrand()` | `int` | `[0, INTS_MAX]` (signed positive) (`tierra.h:292`) |
| `tlrand()` | `I32s` | `[0, I32S_MAX]` — 32-bit positive signed (`tierra.h:302`; 64-bit build composes two `tintrand()` halves, `tierra.h:294-296`) |
| `tulrand()` | `I32u` | `[0, I32U_MAX]` — 32-bit unsigned (`tierra.h:301`) |
| `tirand()` | `I16s` | `[0, I16S_MAX]` — 16-bit positive signed (`tierra.h:306`) |
| `tuirand()` | `I16u` | `[0, I16U_MAX]` — 16-bit unsigned (`tierra.h:309`) |
| `tcrand()` | `I8s` | `[0, I8S_MAX]` — 8-bit positive signed (`tierra.h:312`) |
| `tucrand()` | `I8u` | `[0, I8U_MAX]` — 8-bit unsigned (`tierra.h:315`) |

Because the source deviate is in `[0,1)`, each macro yields a non-negative value
strictly below the max+1 bound. Callers form bounded picks with `% N` (e.g.
`tlrand() % NumCells`, `tlrand() % SoupSize`). A commented-out `gasdev()`
Gaussian generator using the Box–Muller method exists behind `#ifdef FUTURE`
(`trand.c:80-110`) but is unused.

**Consumers (operator.c).** Reaper/soup addressing uses `tlrand() % NumCells`
(`operator.c:161`) and `tlrand() % SoupSize` (`operator.c:193`); bit-flip
mutation uses `tdrand() < MutBitProp` (`operator.c:218`); crossover, insertion,
deletion, and segment operators all draw offsets/sizes with `tlrand() % …`
(`operator.c:246-883`). `mut_site` picks a ploidy strand with
`tcrand() % PLOIDY` (`operator.c:198`).

**Code.** `tierra.h:291-315`; consumers `operator.c:161,193,198,218,246-883`.

---

## 2. Statistics

The driver is `SystemWork()` in `tierra.c`: when `InstExe.i` wraps past
`10^6` it increments `InstExe.m` and calls `stats()` then `plan()`
(`tierra.c:707-743`).

### 2.1 `stats()` — verify + rebuild genotype stats

**What.** Cleans/verifies the gene bank and updates size/pop/memory maxima once
per million instructions.

**How** (`bookeep.c:420-448`). If a gene banker is active (`GeneBnker`) and any
cell was `reaped` this interval, it garbage-collects and (under `ERRORTIE`)
verifies the bank, then calls `CalcGBStats(sl, siz_sl)`. Without a banker it
calls `CalcSoupStats()` (which scans the soup into a temporary bank). Always
calls `CalcTimeSoup()` to compute time-averaged metrics. (`NET` branches manage
subnet changes; not covered here.)

**Code.** `bookeep.c:420-448`.

### 2.2 `plan()` — speed, control vars, reset accumulators

**What.** Computes run speed, adjusts flaw/mutation/limit control variables for
the next interval, updates the plan-mode display, then zeros the per-interval
counters.

**How** (`bookeep.c:465-530`).

- **Speed** (`bookeep.c:471-477`): `FESpeed = TierraClock - OClock` (wall
  seconds elapsed over the last million); `Speed = 1000000 / FESpeed`
  (instructions/second); `LastSpeedUpdate = TierraClock`.
- Garbage-collects the cells array if `reaped` (`CellsGarbageCollect()`).
- `AdjCtrlVars()` (`bookeep.c:1220-1231`) recomputes search/put/malloc limits
  and flaw/mutation rates as multiples of `AverageSize`.
- **Reset** (`bookeep.c:513-529`): zeros `RepInstEffSum`, `TimePop`,
  `RepInstSum`, `RepNum`, `DeathNum`, `AgeSum`, `BirthNum`, `EjectToSelf`, and
  sets `TimeStats = InstExe`. (`NET` also resets birth-eject/inject and
  fecundity sums.)

**Params.** `SearchLimit`, `AbsSearchLimit`, `PutLimit`, `MalTol`,
`GenPerMovMut`, `GenPerBkgMut`, `GenPerFlaw` feed `AdjCtrlVars`/`CalcFlawRates`
(`bookeep.c:1220-1256`).

**Code.** `bookeep.c:465-530`; control-var math `bookeep.c:1220-1256`.

### 2.3 `CalcTimeSoup()` — time-averaged metrics

**What.** Derives the headline per-interval biology metrics.

**How** (`bookeep.c:545-616`). Only runs once `InstExe.m` is nonzero.
`dt = SubEvent(InstExe, TimeStats)` is the interval length in instructions.

- `AvgBD = (BirthNum + DeathNum) / 2` — average birth/death events.
- **`AvgPop = TimePop / dt`** — average population over the interval, where
  `TimePop` is the running sum of `ttime * NumCells` accumulated in `OutDisk()`
  (`bookeep.c:361,403`).
- **`Generations += AvgBD / AvgPop`** — generations accrue as
  events-per-average-individual (`bookeep.c:554-556`).
- **`RepInst = RepInstSum / RepNum`**, **`RepInstEff = RepInstEffSum / RepNum`**
  — average instructions per replication and per byte; fall back to
  `LazyTol*10000` if no replications occurred (`bookeep.c:557-568`).
- **`FecundityAvg`** = `FecunditySum / (DeathNum ? DeathNum : NumCells)`
  (floored to 1.0 if the sum is negligible). If no deaths occurred, it scans the
  live reaper queue to sum fecundity/age instead (`bookeep.c:569-589`).
- **`AgeAvg`** = `AgeSum / (DeathNum ? DeathNum : NumCells)` — mean
  `cr->d.inst` at death (`bookeep.c:584`).
- `MaxMemry` is normalized by `MaxGenMem.size` at the end (`bookeep.c:614-615`).

Front-end mirror variables (`FEDeathNum`, `FEBirthNum`, `FEEjectToSelf`, …) are
copied for display (`bookeep.c:601-603`).

**Params/state.** `TimePop`, `RepInstSum`/`RepNum`, `RepInstEffSum`, `AgeSum`,
`FecunditySum`, `BirthNum`/`DeathNum`, `LazyTol`. `TimeGenIndiv` ("cpu cycles
per replication, on average", `globals.h:362`) is a display variable in the
same family. `FESpeed`/`Speed` documented in §2.2; `MinSpeed` in §3.5.

**Code.** `bookeep.c:545-616`.

### 2.4 `CalcAverages()` — mean cell size

**What.** Recomputes `AverageSize` by direct scan of all cells.

**How** (`bookeep.c:623-647`). Iterates `cells[ar][ci]` (skipping the two dummy
cells at `[0][0..1]`), summing `d.gen.size` over live cells (`tc->ld`), counting
`tNumCells`, then `AverageSize /= tNumCells`. Under `ERRORTIE` it asserts the
count equals `NumCells`.

**Code.** `bookeep.c:623-647`.

### 2.5 `CalcSoupStats()` / `MkGBFromSoup()`

**What.** When no persistent gene banker is active, build a throwaway genotype
bank from a full soup scan and run `CalcGBStats` over it.

**How** (`bookeep.c:657-665`). `MkGBFromSoup()` (`bookeep.c:873-1025`) walks all
cells, hashes each genome, `CheckGenotype`s it into a size-indexed `SList`
array, and accumulates per-genotype population and reproduction-efficiency
running averages (`AvgRpdEff[0/1]` for daughter 1/2, `bookeep.c:971-993`). The
temporary bank is freed by `FreeGB()` after stats (`bookeep.c:664`).

**Code.** `bookeep.c:657-665`, `873-1025`.

### 2.6 `CalcGBStats()` — averages + maxima from the bank

**What.** Single pass over the gene bank computing `AverageSize`, `MaxPop`,
`MaxMemry` and the identifying labels for the dominant genotype.

**How** (`bookeep.c:675-747`). Zeros `tNumCells, AverageSize, MaxPop, MaxMemry`.
For each size class `si` (descending) and each genotype `gi` with population
`pop`:

- `mem = pop * si` (total bytes held by that genotype).
- If `pop > MaxPop`: update `MaxPop`, `MaxGenPop.size = si`, and set
  `MaxGenPop.label` via `Int2Lbl(gi)` — **the most populous genotype**.
- If `mem > MaxMemry`: update `MaxMemry`, `MaxGenMem` similarly — **the genotype
  occupying the most memory**.
- Accumulate `AverageSize += mem`, `tNumCells += pop`.

Finally `AverageSize = tNumCells ? AverageSize/tNumCells : 0` — the
population-weighted mean genome size. Asserts `tNumCells == NumCells`
(`FEError(-103)`).

**Code.** `bookeep.c:675-747`.

### 2.7 `CalcGBMaxes()` — maxima only

**What.** Lighter pass that recomputes only `MaxPop`/`MaxMemry` and their
labels, without touching averages (`bookeep.c:756-784`). Same max logic as §2.6.

**Code.** `bookeep.c:756-784`.

### 2.8 Birth/death accounting counters

**What.** Per-interval event counters, incremented at the moment of each
division and reap, consumed by `CalcTimeSoup()` and reset in `plan()`.

**How.**

- **Birth** — `DivideBookeep()` (`bookeep.c:26-162`): increments mother
  `fecundity`, `RepNum++`, `BirthNum++` (`bookeep.c:48,80-81`); accumulates
  reproduction-efficiency sums `RepInstEffSum`/`RepInstSum` from
  `repinst`/`mov_daught` (`bookeep.c:151-156`); records `birthtime`; writes a
  `'b'` record via `OutDisk()` (`bookeep.c:158`). Under `NET`, `BirthEject` vs
  `BirthLocal` split by whether the daughter was ejected (`bookeep.c:82-103`).
- **Death** — `ReapBookeep()` (`bookeep.c:170-233`): writes a `'d'` record
  (`bookeep.c:174`); for non-ejected daughters adds `cr->d.fecundity` to
  `FecunditySum`, `cr->d.inst` to `AgeSum`, and `DeathNum++`
  (`bookeep.c:183-195`); decrements `NumCells`; reinitializes the cell slot; if
  the soup emptied, reinitializes free memory and the reaper queue
  (`bookeep.c:212-227`); sets `reaped = 1`.
- **Mutation bookkeeping** — `MutBookeep()` marks a cell's `nonslfmut` flag when
  a mutation hits its genome (`bookeep.c:242-282`); `CellMutBookeep()`
  re-genotypes mutated cells, writing paired `'d'`/`'b'` records
  (`bookeep.c:284-307`).

**Params/state.** `BirthNum`, `DeathNum`, `RepNum`, `RepInstSum`,
`RepInstEffSum`, `AgeSum`, `FecunditySum`, `NumCells`, `reaped`
(`globals.h:241-247`).

**Code.** `bookeep.c:26-307`.

---

## 3. Output

### 3.1 `OutDisk()` — per-event birth/death log

**What.** Appends one compact line per birth/death to the run log; simultaneously
accumulates `TimePop` even when disk output is off.

**How** (`bookeep.c:317-410`). Active when `DiskOut` is set.

- **First call** (`FirstOutDisk`): opens the log file. With `BrkupSiz > 0` it
  splits into numbered `break.N` files (`break.1`, `break.2`, …); otherwise it
  writes a single `tierra.run` file. Path is prefixed by `GenebankPath`
  (`bookeep.c:322-356`). Writes an absolute first record:
  `"<InstExe.i> <b|d> <size> [label]\n"`.
- **Subsequent calls** write **delta-encoded** records: the elapsed
  instruction-time `ttime = InstExe.i - lo.time` (wrapping +`10^6` if negative),
  then emits the birth/death char only if it changed vs the last record
  (`lo.bd`), the size only if changed (`lo.size`), and the genotype label only
  if changed (`lo.label`) (`bookeep.c:358-375`). This produces a highly
  compressed event stream.
- **`TimePop` accumulation** (`bookeep.c:361,403`):
  `TimePop += ttime * NumCells` on every event — this is the integral that
  `CalcTimeSoup()` divides by `dt` to get `AvgPop`. It is accumulated even in the
  `DiskOut == 0` branch (`bookeep.c:396-405`), so population averaging works
  regardless of logging.
- **File rollover** (`bookeep.c:376-393`): when `BrkupSiz` is set and
  `BrkupCum` (cumulative bytes) exceeds `BrkupSiz * 1024`, the current file is
  closed and `break.<++BrkupCou>` opened.
- `lo` (last-output record: `bd`, `size`, `time`, `label`) is updated at the end
  of every call (`bookeep.c:406-409`).

**Params (values).** `BrkupSiz` — file-split size in KB, `0` disables splitting
(`globals.h:260`); `BrkupCou` — current file index (`globals.h:258`);
`BrkupCum` — bytes written to the current file (`globals.h:259`); `DiskOut`,
`GeneBnker`, `GenebankPath`.

**Code.** `bookeep.c:317-410`.

### 3.2 `WriteSoup()` / `soup_out`

**What.** Writes a full human-readable snapshot of the run parameters and soup
state, for resuming or archiving.

**How** (`tsetup.c:3782-...`). Flushes the `break` log position (`tftell`),
saves the gene bank if `DiskBank`, opens `<GenebankPath>soup_out` (or
`soup_out.io.d` on IBM3090), and dumps a header (`"# tierra core:"` + timestamp)
followed by observational/genetic parameters. Called at `SaveFreq` intervals and
at shutdown (`tierra.c:142`, `717`).

**Code.** `tsetup.c:3782-3816`.

### 3.3 `SavDynMem()` / `core_out`

**What.** Binary dump of the dynamic in-core structures (soup memory, cell
arrays) so a run can resume exactly.

**How** (`tsetup.c:4114-...`). Writes `<GenebankPath>core_out` (`core_out.io.d`
on IBM3090). Read back by `ReadDynMem()` (`tsetup.c:4193-...`) on resume; freed
by `FreeDynMem()`. Invoked from `WriteSoup`.

**Code.** `tsetup.c:3713-3718` (naming), `4114-4211`.

### 3.4 `SaveFreq` — periodic snapshotting

**What.** Controls how often full snapshots are taken during a run.

**How** (`tierra.c:716-736`). In `SystemWork()`, when `SaveFreq != 0` and
`InstExe.m % SaveFreq == 0`, calls `WriteSoup(0)`. If `SavRenewMem` is set it
additionally frees and re-reads all dynamic memory and the gene bank (a periodic
defragmentation / leak-guard), preserving the current cell pointer.

**Params (values).** `SaveFreq` — snapshot period in millions of instructions;
`0` disables (`globals.h:352`). `SavRenewMem` gates the memory-renew path.

**Code.** `tierra.c:716-736`.

### 3.5 Histograms (`ttools.c`)

**What.** On-screen (and optionally logged) bar-chart histograms of the
population, keyed by size, genotype, memory, or reproduction efficiency. Driven
by the `IMode` display mode.

**How.** `query_species()` (`ttools.c:247-588`) is the builder:

- Chooses entry count: `NumGenotypes` for `GEN_HIST`/`GEN_EFF`, else `NumSizes`
  (`ttools.c:266-269`); allocates a `HistType Hist[]` array.
- Walks the size list `sl[ci]`; for each valid size/genotype fills
  `Hist[].size`, `Hist[].lbl`, and a count:
  - **Size histogram** (`SIZ_HIST`): `count = sl[ci]->num_c` (cells of that
    size) (`ttools.c:386`).
  - **Memory histogram** (`SIZM_HIST`): count is later multiplied by size —
    `Hist[t].count *= Hist[t].size` (`ttools.c:406-415`) — giving bytes.
  - **Genotype histogram** (`GEN_HIST`): `count = sl[ci]->g[t]->pop`
    (`ttools.c:368`).
  - **Efficiency histograms** (`SIZ_EFF`, `GEN_EFF`): `dblcount` =
    `instP / mov_daught` for daughter `EffDaught` — CPU-instructions executed
    per byte moved into the daughter, i.e. reproduction efficiency
    (`ttools.c:339-353,376`).
- Tracks `Max_hits` (tallest bar) to scale the display; computes
  `HistNStars = (fe_width - 20) / Max_hits` — stars per unit (`ttools.c:488`).
- Sorts with `hg_compare` (genotype modes) or `hs_compare` (size modes)
  depending on `HistSortOrder` (`FREQ_*` vs by-size) (`ttools.c:416-419`,
  comparators `ttools.c:35-89`).
- Renders each row as label + count + a bar of `n_star = HistNStars * count`
  asterisks; optionally echoes to the run log if `TierraLog && HistPrint`
  (`ttools.c:502-588`).

`query_spec_d()` (`ttools.c:601-819`) does incremental single-line redraws for
one `(size,label)` as its bar length changes. `InitSizeQuery`/`DispSizeQuery`
(`ttools.c:98-238`) provide a paged per-size species listing. `FESoupImage()`
(`ttools.c:998-1028`) renders a spatial ASCII map of the soup, one char per
`SoupSize/(x*y)` bytes, marking free memory `'.'`, mothers `'A'+`, daughters
`'a'+`.

**Params/state.** `IMode` (`SIZ_HIST`, `SIZM_HIST`, `GEN_HIST`, `SIZ_EFF`,
`GEN_EFF`); `Hist`, `HistAlocSiz`, `Max_hits`, `HistNStars`, `histoentcnt`,
`histodsplnct`, `HistSortOrder`, `EffDaught`, `HistPrint`, `TierraLog`.

**Code.** `ttools.c:247-588` (`query_species`), `35-89` (comparators),
`601-819` (`query_spec_d`), `998-1048` (soup image).

### 3.6 CPU-load governor

**What.** Keeps Tierra from monopolizing the host CPU: sets process nice/priority
and periodically sleeps so it runs only a chosen fraction of wall time.

**How.**

- **Nice / priority** (`tsetup.c:3195-3209`): on `_WIN32`,
  `SetPriorityClass(IDLE_PRIORITY_CLASS)` if `TierraNice` else
  `NORMAL_PRIORITY_CLASS`; on Unix, `nice(TierraNice)`.
- **Duty-cycle limiter** — the run/sleep split is precomputed from the period
  and proportion (`tsetup.c:2906-2911`, mirrored in `frontend.c:1416-1419`):
  - `CpuLoadLimitRunTime  = CpuLoadLimitProp * CpuLoadLimitPeriod`
  - `CpuLoadLimitSleepTime = (1 - CpuLoadLimitProp) * CpuLoadLimitPeriod`
- **Trigger**: each million instructions, if
  `tietime() - CpuLoadLimitLstSlp > CpuLoadLimitRunTime`, set
  `CpuLoadLimitSleepNow = 1` (`tierra.c:744-748`).
- **Sleep**: in the main `life()` loop, when `CpuLoadLimitSleepNow` is set, call
  `tsleep(CpuLoadLimitSleepTime)`, clear the flag, and reset
  `CpuLoadLimitLstSlp` (`tierra.c:187-191`). Independently, `TierraSleep`
  triggers a `TieSleep` when a key/mouse is idle (`tierra.c:178-179`).

**Speed measurement & `MinSpeed` governor.** `Speed` is updated two ways:
`plan()` sets `Speed = 1000000 / FESpeed` per million (`bookeep.c:474-476`), and
in `NET` builds `life()` refreshes it every `SpeedUpdate` seconds as
`Speed = InstExe.i / (LClock - TierraClock)`, falling back to an arbitrary large
value or `MinSpeed` when the soup is empty (`tierra.c:210-215`). If
`MinSpeed >= 0` and `Speed < MinSpeed`, the run aborts with
`FEError(-5, "Speed too slow")` (`tierra.c:714-715`) — a floor that kills runs
that have become too slow to be worth continuing.

**Params (values).** `CpuLoadLimitPeriod` — total cycle length in milliseconds,
`0` disables the limiter (`globals.h:49`); `CpuLoadLimitProp` — fraction of the
period to run, `[0,1]` (`globals.h:48`); `CpuLoadLimitRunTime` /
`CpuLoadLimitSleepTime` — derived run/sleep durations (`globals.h:46-47`);
`CpuLoadLimitLstSlp`, `CpuLoadLimitSleepNow` (`globals.h:44-45`); `TierraNice`
(`globals.h:417`); `TierraSleep` — idle sleep seconds, `0` = none
(`globals.h:29`); `SpeedUpdate` — speed-recalc period in seconds
(`globals.h:31`); `MinSpeed` — minimum speed to continue, negative disables
(`globals.h:280`); `SpdZeroTime` (`globals.h:472`).

**Code.** governor init `tsetup.c:2906-2911`, `frontend.c:1416-1419`; nice/prio
`tsetup.c:3195-3209`; trigger `tierra.c:744-748`; sleep `tierra.c:187-191`;
`MinSpeed` abort `tierra.c:714-715`; speed calc `bookeep.c:474-476`,
`tierra.c:210-215`.

---

## Appendix — key state variables (globals.h)

| Variable | Meaning | Line |
|----------|---------|------|
| `RandIx1/2/3` | three LCG state words | `globals.h:429` |
| `TrandArray[98]` | shuffle table (1..97 live) | `globals.h:430` |
| `AvgPop` | avg population over last million | `globals.h:294` |
| `Generations` | elapsed generations | `globals.h:28` |
| `MaxPop` | max population of any genotype | `globals.h:325` |
| `FecundityAvg` | avg fecundity at death | `globals.h:434` |
| `AgeAvg` | avg age (`inst`) at death | `globals.h:432` |
| `RepInst` / `RepInstEff` | insts/replication, cycles/byte | `globals.h:243-245` |
| `TimePop` | Σ ttime·NumCells per million | `globals.h:363` |
| `TimeGenIndiv` | cpu cycles/replication (display) | `globals.h:362` |
| `Speed` / `FESpeed` | insts/sec, seconds/million | `globals.h:253` |
| `BrkupSiz/Cou/Cum` | break.N split size / index / bytes | `globals.h:258-260` |
| `SaveFreq` | snapshot period (millions) | `globals.h:352` |
| `CpuLoadLimitPeriod/Prop` | governor period / duty fraction | `globals.h:48-49` |
| `TierraNice` / `TierraSleep` | process nice / idle sleep | `globals.h:417,29` |
| `MinSpeed` / `SpeedUpdate` | speed floor / recalc period | `globals.h:280,31` |
