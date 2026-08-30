# Statistics & Observation — Engineering Spec              (Code: STAT · Milestone: M1)

**Status:** v1. Owns the engine's **metrics** — the numbers that feed UI charts, tutorial
prompts, the tank visualization, and the deterministic **run digest** consumed by golden
fixtures.
**Upstream:** [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §14 (the `stats()` surface:
`{population, genotypes, births, deaths, fullness}`), §16 (golden-run digest = population,
genotype count, births/deaths, soup checksum at cycle N).
**Reference:** [`docs/original-tierra/08-rng-stats-output.md`](../../../original-tierra/08-rng-stats-output.md)
§Stats (`stats()`/`plan()` per-million loops; `AvgPop`, `FecundityAvg`, `AgeAvg`, `MaxPop`,
`Generations`, `Speed`; size / genotype / memory histograms via `query_species`).
**Contracts obeyed:** C-DET (every simulation-path metric is integer and computed in a fixed
order; no `Math.random`/`Date.now` feeds a stat that a digest depends on), C-INT (population,
counts, sizes, births/deaths are integers), C-ADDR (any soup scan uses `ad()`), C-SNAP (all
accumulators live in `World`; no module-level mutable state — the counters serialize with the
engine so a restored run continues the same trajectory), C-ID (per-genotype identity comes
from the genebank `[12]`, never from Map iteration order).

---

## 1. Purpose & responsibility

Statistics is the engine's **read-only observation layer**. It owns two families of numbers
and guarantees a hard wall between them:

1. **Simulation-path metrics** — integers that are (or feed) reproducibility: `population`,
   live `genotypes`, cumulative `births`/`deaths`, population-weighted `avgSize`,
   `generations`, and per-genotype counts. `avgSize` in particular is *load-bearing* (it sizes
   the template `searchLimit`, `[06]`), so it is C-DET integer and updated on a **deterministic
   cadence**. These are the numbers the **run digest** freezes.
2. **Presentation-only metrics** — values that exist purely to drive UI and may use `float01`
   (soup `fullness = occupied/soupSize`, histogram fractions, `speed` in insts/sec). No
   simulation path and no digest may read a float; presentation math never perturbs state.

It owns the cheap derivation of the three **histograms** (size distribution, genotype/species
distribution, memory-map occupancy) from data the engine already maintains (the genebank
`[12]` and the creature list / allocator intervals `[03]`), the compact **observation
SNAPSHOT** frame handed to the UI/worker each observation tick (an allocation-light,
read-only view — explicitly *not* the full engine snapshot `[14]`), and the **run DIGEST**
used by golden fixtures. It computes nothing by mutating engine state and raises no faults;
it is a pure function of `World` plus its own append-only counters.

---

## 2. Interfaces

```ts
// stats.ts — imports: types, genebank, alloc (read-only views). Imported by: world (counter
// bumps on birth/death), snapshot (serializes counters), engine API (stats()/digest/observe),
// worker/UI (observation frame only). Never imported by hot-path handlers.

type Int = number;        // integer (C-INT)
type Float01 = number;    // presentation-only real in [0,1] (never on a simulation path)

// (A) The live scalar surface — matches M0-TECH-DESIGN §14 stats(), plus M1 additions.
interface LiveStats {
  cycles: Int;            // world.cycles at read time (the global clock)
  population: Int;        // count of LIVE creatures (== world.creatures live count)
  genotypes: Int;         // count of DISTINCT genotypes with >=1 live creature (from genebank)
  births: Int;            // cumulative divide events since run start (monotonic)
  deaths: Int;            // cumulative reap events since run start (monotonic)
  avgSize: Int;           // population-weighted mean live genome size, integer (floor)
  generations: Int;       // whole generations elapsed (see §4.4); integer counter
  fullness: Float01;      // occupied / soupSize — PRESENTATION ONLY
}

// (B) Histograms — derived on demand, cheaply, from genebank + creature list + alloc.
interface HistBin { key: Int; label: string; count: Int; }   // count is a live-creature or byte tally
interface Histograms {
  size:     HistBin[];    // key = genome size, count = # live creatures of that size (Σ count == population)
  genotype: HistBin[];    // key = genotype id, label = genebank label, count = live pop of that genotype
  memory:   HistBin[];    // key = genotype id, count = BYTES held == pop * size (soup occupancy by species)
}

// (C) The observation frame — a compact, allocation-light, READ-ONLY snapshot for UI/worker.
// NOT the engine Snapshot (§14): no soup bytes, no per-creature CPU, no RNG state.
interface ObservationFrame {
  readonly cycles: Int;
  readonly stats: Readonly<LiveStats>;
  readonly topGenotypes: readonly Readonly<HistBin>[];   // bounded (topK) genotype bins, pop-sorted
  readonly sizeHist:      readonly Readonly<HistBin>[];   // bounded size bins
  readonly tank: Readonly<TankView>;                      // spatial map for the visualization
}
// Spatial map for the tank: soup quantized into `cells` buckets; each byte class 0=free,
// 1=mother-code, 2=daughter (gestating). Fixed-length, reused buffer (see §3/§6).
interface TankView { readonly width: Int; readonly height: Int; readonly cells: Uint8Array; }

// (D) The run digest — deterministic, stable per seed; the golden-fixture contract.
interface RunDigest {
  cycle: Int;             // the checkpoint cycle N this digest describes
  population: Int;
  genotypes: Int;
  births: Int;
  deaths: Int;
  soupChecksum: Int;      // 32-bit integer checksum over all soup bytes (C-INT), order-fixed
}

interface Stats {
  onBirth(): void;        // world calls exactly once per successful divide  (births++)
  onDeath(): void;        // world calls exactly once per reap               (deaths++)
  live(w: World): LiveStats;
  histograms(w: World): Histograms;
  observe(w: World, topK: Int, tank: TankView): ObservationFrame;  // fills the reused tank buffer
  digest(w: World, cycle: Int): RunDigest;
}
```

- **Consumers.** `World` (`[07]`/`[09]`) calls `onBirth`/`onDeath` from the reproduction
  `[08]` and reaper `[10]` hooks — the only mutating entry points, and both are integer bumps.
  Engine API (`[15]`) exposes `stats()`/`digest()`/`observe()`. The web worker/UI reads only
  the `ObservationFrame`. Golden fixtures (`test/golden/`) compare `RunDigest`.
- **Ownership.** The counters (`births`, `deaths`, `generations`, and the running `avgSize`)
  are members of `World` (C-SNAP) so they serialize and a restored engine continues the same
  trajectory. `Stats` itself is stateless beyond those `World` fields plus a reusable scratch
  buffer for the tank (never part of the digest).

---

## 3. Data structures

| Field (in `World`) | Type | Why / units | Invariant it holds |
|---|---|---|---|
| `births` | `Int` | cumulative successful `divide`s since run start | monotonic non-decreasing; bumped once per birth (C-INT) |
| `deaths` | `Int` | cumulative reaps since run start | monotonic non-decreasing; bumped once per death |
| `generations` | `Int` | whole generations elapsed (§4.4) | monotonic; integer-derived, never a float on the sim path |
| `avgSize` | `Int` | population-weighted mean live genome size (floor) | recomputed on a deterministic cadence (§4.4); ≥ `MinCellSize` while population > 0 |
| `population` | derived | count of live creatures | equals live-creature count; not stored — read from `world.creatures` |
| `genotypes` | derived | distinct live genotypes | from genebank `[12]` per-genotype live-count > 0 |

Scratch (never serialized, never in the digest):

| Field | Type | Why |
|---|---|---|
| `tank.cells` | `Uint8Array` (fixed len = width·height) | reused across observation ticks — the allocation-light contract (§6). Overwritten in place each `observe`. |
| histogram bin arrays | pooled/rebuilt | built on demand from the genebank size index; small (bounded by `NumSizes`/`NumGenotypes`). |

- **Why derive population/genotypes instead of storing them.** They are exact functions of
  state the engine already keeps live: population is the creature-list live count; genotypes is
  the count of genebank entries with a nonzero live tally. Storing them would risk drift; the
  counters that *must* be stored are the cumulative event totals (`births`/`deaths`), because
  they are history, not a snapshot of the present.
- **Genebank as the histogram source.** The genebank `[12]` maintains, per genotype, its
  genome size, a label, and a **live population count** (bumped by the same birth/death hooks).
  Because it is already indexed by size (Tierra's `SList` by size class — reference §2.5/§3.5),
  the size and genotype histograms fall out of one pass over that index; the memory histogram
  is `pop * size` per bin. No full soup scan is needed for any histogram.

---

## 4. Behavior / algorithms

### 4.1 Live scalars

```
live(w):
  population = countLive(w.creatures)          # C-DET: iterate the ordered creature list, not a Map
  genotypes  = w.genebank.liveGenotypeCount()  # entries with live pop > 0
  return {
    cycles: w.cycles, population, genotypes,
    births: w.births, deaths: w.deaths,
    avgSize: w.avgSize, generations: w.generations,
    fullness: w.alloc.occupancy() / w.soupSize,   # <-- the ONLY float; presentation only
  }
```

- Every field except `fullness` is an integer read of an existing counter or an ordered count.
  `fullness` is computed last and never fed back into simulation.

### 4.2 Birth / death accounting

```
onBirth():  w.births += 1     # called once from divide (§[08]) after a successful daughter split
onDeath():  w.deaths += 1     # called once from reap  (§[10]) after a cell is killed
```

- Exactly one bump per lifecycle event, at the moment the event commits, so the counters match
  the genebank hooks one-for-one. Never bumped speculatively (a failed `divide` that `raiseE`s
  is **not** a birth). Monotonic by construction (only `+= 1`).

### 4.3 Histograms (cheap derivation)

```
histograms(w):
  size = []; genotype = []; memory = []
  for each size-class s in w.genebank.sizeIndex (ascending, deterministic order):
      liveOfSize = 0
      for each genotype g in class s with live pop p > 0:
          genotype.push({ key: g.id, label: g.label, count: p })
          memory.push(  { key: g.id, label: g.label, count: p * s })   # bytes held
          liveOfSize += p
      if liveOfSize > 0: size.push({ key: s, label: str(s), count: liveOfSize })
  return { size, genotype, memory }
```

- One pass over the size-indexed genebank ⇒ O(genotypes). No soup scan, no per-byte work.
- **Size histogram sums to population:** `Σ size[i].count == population` because every live
  creature has exactly one genotype in exactly one size class (INV: genebank live tallies
  partition the population). This is a checked criterion (STAT-005).
- **Memory histogram = soup occupancy by species:** `Σ memory[i].count == Σ(pop·size)`, i.e.
  the total live-code bytes; it equals allocator occupancy minus gestating-daughter bytes and
  is what the "memory map" view renders. Bins are the same ordering as `genotype` for a stable
  UI.
- **Deterministic order:** the genebank size index is traversed in a fixed (size-ascending,
  then genotype-id) order — never Map key order (C-DET) — so two same-seed runs emit
  byte-identical histograms.

### 4.4 Update cadence (deterministic) & generations

- **`avgSize`** is recomputed **on every birth and death** (M0-TECH-DESIGN §18.2 proposal):
  `avgSize = floor(Σ(size over live creatures) / population)`, or via the genebank's
  running Σ(pop·size)/Σpop to avoid a scan. Recomputing on each lifecycle event is fully
  deterministic (events happen in a fixed order) and is what the template `searchLimit` reads;
  it is *not* tied to wall-clock or an arbitrary cycle modulus.
- **`generations`** accrues in integer terms as births cross the current average population:
  each time cumulative `(births+deaths)/2` exceeds a multiple of the running average
  population, `generations += 1` (the integerized analogue of Tierra's
  `Generations += AvgBD/AvgPop`, reference §2.3). Kept integer so the digest is stable.
- **Observation frames** are produced on a host-chosen **observation cadence** (e.g. every K
  cycles, K set by the API/worker, default deterministic). The cadence controls *how often the
  UI is refreshed*; it never changes simulation state, so a slow or fast observer yields the
  same digest. Golden digests are taken at fixed checkpoint cycles (`N`), independent of the UI
  cadence.

### 4.5 Observation frame

```
observe(w, topK, tank):
  s  = live(w)                                   # scalars (one float: fullness)
  h  = histograms(w)
  top = firstK(sortByPopDesc(h.genotype), topK)  # bounded; deterministic tiebreak by genotype id
  fillTank(w, tank)                              # overwrite tank.cells IN PLACE (no alloc)
  return frozen({ cycles: w.cycles, stats: s, topGenotypes: top, sizeHist: firstK(h.size,...),
                  tank })
```

```
fillTank(w, tank):                               # quantize soup -> width*height buckets
  bucketBytes = ceil(soupSize / tank.cells.length)
  tank.cells.fill(0)                             # 0 = free
  for each live creature c (ordered list):
      mark buckets covering [c.start, c.start+c.size)   as 1 (mother code)   via ad()
      if c.dauSize > 0: mark daughter buckets            as 2 (gestating)
```

- The returned frame is **frozen** (`Object.freeze` on the wrapper and on each bin) so the
  UI/worker cannot mutate engine-derived data. `tank.cells` is the **same buffer** every tick
  (reused), overwritten in place — no per-frame allocation (STAT-007). This is the compact
  frame the worker posts to the main thread: scalars + bounded histograms + one quantized byte
  array, orders of magnitude smaller than the full engine snapshot `[14]`.

### 4.6 Run digest

```
digest(w, cycle):
  return {
    cycle,
    population: countLive(w.creatures),
    genotypes:  w.genebank.liveGenotypeCount(),
    births:     w.births,
    deaths:     w.deaths,
    soupChecksum: checksum32(w.soup),   # fixed-order fold over every soup byte (C-INT)
  }
```

- **`checksum32`** folds all soup bytes in ascending address order with a fixed 32-bit integer
  mix (e.g. FNV-1a-style, `Int32` wrap per C-INT). Same bytes ⇒ same checksum; every field is
  an integer. No float, no genotype-*label* string, no Map order enters the digest.
- **Determinism/stability:** because every input is a stored integer counter or an
  order-fixed fold, `digest(w, N)` is **identical across two same-seed runs** and across a
  `snapshot`/`restore` boundary (the counters serialize). This is exactly the golden-fixture
  freeze of M0-TECH-DESIGN §16 and the `INV-REPLAY` backbone. (STAT-006.)

### 4.7 How this feeds tutorials & the tank visualization

- **Tutorials** ("watch the population saturate") read `LiveStats.population` and `fullness`
  over successive observation frames: a tutorial step's success predicate is e.g.
  `fullness >= 0.7` or `population` plateauing. Because `population` is exact and `fullness`
  monotone toward saturation under the ancestor, the prompt fires deterministically for a given
  seed.
- **Tank visualization** renders `TankView.cells` (free/mother/daughter classes) as the
  spatial soup map — the modern analogue of Tierra's `FESoupImage()` ASCII map (reference
  §3.5). The genotype/memory histograms drive the species bar charts alongside it.

---

## 5. Interconnections

- **Calls down (read-only):** genebank `[12]` for per-genotype size/label/live-count and the
  size index (histograms, `genotypes`); allocator `[03]` `occupancy()` for `fullness` and the
  tank daughter/mother extents; soup `[02]` bytes (via `ad()`) only for `soupChecksum` and the
  tank quantization; the creature list for `population`. It **mutates nothing** it reads.
- **Called by:**
  - `World`/Reproduction (`[08]`) — `onBirth()` on a committed `divide`.
  - `World`/Reaper (`[10]`) — `onDeath()` on a kill. These two are the only writers of stats
    state, and both are `+= 1`.
  - Engine API (`[15]`) — `stats()` (§14 surface), `digest()` (golden fixtures), `observe()`
    (worker/UI).
  - Snapshot (`[14]`) — serializes `births`/`deaths`/`generations`/`avgSize` as part of
    `World`; restore continues them, so the post-restore digest matches (INV-ROUNDTRIP).
- **Contracts crossed:** C-DET (every digest/sim-path input is integer & order-fixed — this
  system is a primary guardian of digest stability), C-SNAP (counters live in `World`),
  C-ID (genotype identity from the genebank, not iteration order). Feeds INV-REPLAY /
  INV-DET / INV-ROUNDTRIP via the digest.

---

## 6. Determinism & edge cases

- **Float wall (C-DET).** The *only* float that ever leaves this system on a path that could
  reach simulation is — none. `fullness`, histogram fractions, and `speed` are presentation
  outputs; nothing simulation-path or digest-related reads them. `avgSize` (which *does* feed
  `searchLimit`) is integer floor. Placing the wall here is what keeps the digest stable.
- **Ordered traversal.** Population count, histogram passes, and the tank fill all iterate the
  **ordered creature list** and the **size-indexed genebank**, never a `Map`/object key order
  (C-DET). Ties (equal-population genotypes in `topGenotypes`) break by genotype id.
- **Empty soup.** `population == 0` ⇒ `avgSize` holds its last value or 0 (documented; must not
  divide by zero), `genotypes == 0`, all histograms empty, `fullness == 0`. `digest` still
  returns valid integers (checksum of a possibly-uniform soup).
- **Monotonic counters.** `births`/`deaths` only ever `+= 1`; a rolled-back speculative clone
  is a *different* `World`, so its counters are independent — no shared mutable state (C-SNAP).
- **Circular addressing.** The tank quantization and `soupChecksum` fold every byte exactly
  once in ascending address order; no wrap double-counting (the checksum walks `[0, soupSize)`
  linearly, not via creature-relative `ad()` offsets).
- **Allocation-light frame.** `observe` reuses the caller-supplied `tank.cells` buffer and
  bounded (topK) bin arrays; it must not allocate per-tick soup-sized buffers. The returned
  frame is frozen (read-only) so the worker cannot write back into engine-derived memory.
- **No faults.** Statistics never `raiseE` and never throws on the hot path; it is pure
  observation. A malformed `topK`/`tank` is a host programming error, handled at the API edge.

---

## 7. Fidelity notes

| Aspect | Tierra | tierra26 | Tag | Why |
|---|---|---|---|---|
| Metric cadence | `stats()`/`plan()` every 10^6 executed instructions (`InstExe.m` wrap) | live scalars available any cycle; `avgSize` recomputed per birth/death; observation frames on a host cadence | **[MOD]** | Decouples measurement from a fixed million-instruction tick; deterministic and finer-grained for UI, digest taken at explicit checkpoint cycles. |
| `AvgPop` | time-integral `TimePop/dt` (float, per-million average) | exact live `population` (integer) each read; averaging left to the UI/tutorial layer | **[MOD]** | Instantaneous integer population is deterministic and digest-safe; a float running average is presentation-only if ever needed. |
| `Generations` | `Generations += AvgBD/AvgPop` (float accrual) | integer accrual as `(births+deaths)/2` crosses running avg population | **[MOD]** | Preserves the "events per average individual" meaning while keeping the digest integer/stable. |
| `AverageSize` | population-weighted mean over the size-indexed bank (float) | same population-weighted mean, integer floor, from genebank Σ(pop·size)/Σpop | **[MOD]** | Same quantity; integerized because `searchLimit` reads it (C-INT). |
| Histograms (size/genotype/memory/efficiency) | `query_species()` builds `Hist[]` from the size list; renders ASCII bars; includes reproduction-efficiency modes | size / genotype / memory histograms from the genebank size index; efficiency histograms deferred | **[MOD]/[OPTIONAL]** | Same three population histograms, derived the same cheap way (size-indexed bank); ASCII rendering replaced by structured `HistBin[]` for the web UI. Efficiency (`instP/mov_daught`) is [OPTIONAL] for M1. |
| Soup image | `FESoupImage()` ASCII spatial map (free `.`, mother `A+`, daughter `a+`) | `TankView` quantized `Uint8Array` (0/1/2) for the canvas tank | **[MOD]** | Same spatial idea; a byte class array is the web-native, allocation-light form. |
| Per-event birth/death log | delta-encoded `break.N` files on disk (`OutDisk()`) | in-memory monotonic `births`/`deaths` counters; no per-event disk log | **[MOD]** | The engine is headless/no-I/O (C-SNAP); the golden **digest** replaces the on-disk event stream as the reproducibility artifact. |
| `Speed` / CPU-load governor / `MinSpeed` | insts/sec measured vs wall-clock; nice/sleep duty cycle; slow-run abort | not in the engine (presentation `speed` may be measured by the host, off the sim path) | **[OPTIONAL]** | Wall-clock has no place in a deterministic headless VM (C-DET); any speed readout is host-side, presentation-only. |
| Fecundity / age at death (`FecundityAvg`, `AgeAvg`) | averaged at reap over the interval | available from genebank/creature bookkeeping if surfaced; not in the core §14 digest for M1 | **[OPTIONAL]** | Superset-agnostic — can be added as presentation metrics without changing the digest contract. |

Fidelity stance: **[MOD] modern metrics, superset-agnostic.** The three population histograms,
the population-weighted average size, the generations notion, and the spatial map are preserved
in meaning; their *implementation* is modernized (integer, structured, allocation-light) and
the disk/wall-clock machinery is dropped in favor of the deterministic digest. Additional
metrics may be layered on the presentation side without touching the digest.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in [`packages/engine/test/13-stats.test.ts`](../../../../packages/engine/test/13-stats.test.ts).
IDs are append-only.

- **STAT-001** — **population == live-creature count:** `live(w).population` equals the number
  of creatures currently alive in `world.creatures` (never counts dead/reaped cells), computed
  by ordered traversal (not Map order).
- **STAT-002** — **births/deaths monotonic & event-matched:** `births` and `deaths` only ever
  increase, bump exactly once per committed `divide`/reap respectively, and equal the count of
  genebank birth/death hook firings; a `divide` that `raiseE`s does **not** increment `births`.
- **STAT-003** — **avgSize == mean of live genomes:** `live(w).avgSize` equals
  `floor(Σ(size over live creatures) / population)` (population-weighted mean), and is
  recomputed deterministically on each birth/death.
- **STAT-004** — **fullness == occupied/soupSize:** `live(w).fullness` equals allocator
  `occupancy() / soupSize` (presentation float in `[0,1]`), and this value is never read by any
  simulation-path computation.
- **STAT-005** — **size histogram sums to population:** `Σ histograms(w).size[i].count`
  equals `live(w).population`; every live creature is counted in exactly one size bin.
- **STAT-006** — **run digest deterministic per seed:** `digest(w, N)` is byte-identical across
  two fresh same-seed/same-descriptor runs at cycle N (population, genotypes, births, deaths,
  soupChecksum all equal), and equal across a `snapshot`/`restore` boundary; every digest field
  is an integer.
- **STAT-007** — **observation frame is allocation-light & read-only:** `observe(w, topK, tank)`
  reuses the supplied `tank.cells` buffer in place (no per-tick soup-sized allocation) and
  returns a frozen frame whose scalars, bins, and tank are not writable by the consumer.
- **STAT-008** — **genotypes == distinct live genotypes:** `live(w).genotypes` equals the number
  of genebank genotypes with a live population > 0, and equals the number of bins in
  `histograms(w).genotype`.
- **STAT-009** — **memory histogram == per-species soup occupancy:** each
  `histograms(w).memory[i].count == pop_i * size_i`, and their sum equals the total live-code
  bytes (Σ pop·size) held by live creatures.
- **STAT-010** — **deterministic ordering (C-DET):** two same-seed runs produce byte-identical
  `histograms()` bin orderings and identical `topGenotypes` (size-ascending / pop-desc with
  genotype-id tiebreak), never dependent on Map/object key order.

---

## 9. Open questions

1. **`generations` accrual formula** — integerize as `(births+deaths)/2` crossing running avg
   population (proposed §4.4), or track a simpler "population turnovers" counter? Both are
   deterministic; the former preserves Tierra's meaning more faithfully.
2. **`avgSize` source** — scan live creatures vs maintain a genebank running `Σ(pop·size)/Σpop`?
   The running sum avoids an O(population) scan per event; confirm the genebank exposes it
   (couples STAT to genebank `[12]` internals).
3. **Observation cadence ownership** — does the worker choose K (cycles per frame), or the
   Scenario? Either way it must not affect the digest; confirm placement in the Engine API.
4. **`topK` default & tiebreak** — default number of genotype bins in a frame, and confirm the
   genotype-id tiebreak is the stable one the UI expects.
5. **Efficiency / fecundity / age metrics** — surface `RepInstEff`/`FecundityAvg`/`AgeAvg` as
   presentation-only metrics in M1, or defer to M2? They need genebank/creature bookkeeping but
   do not touch the digest.
6. **`soupChecksum` algorithm** — fix on FNV-1a-32 (or CRC32) so golden fixtures are portable
   across machines; confirm the exact fold before freezing the first golden set.
