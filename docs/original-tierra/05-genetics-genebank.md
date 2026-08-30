# Tierra v6.02 — Genetic Variation Operators & the Genebank

Reference for Tom Ray's Tierra Simulator v6.02. Source tree:
`reference/tierra-v6.02/tierra/`. All citations are `file:line` into that tree.
Faithful description of the original C only; no comparison to any reimplementation.

## Overview

Tierra introduces genetic variation through **two independent channels**:

1. **Continuous, execution-time perturbation** applied to the whole soup as
   instructions execute, regardless of divide. Three operators live here:
   *background mutation* (`mutate`/`mut_site`), the *flaw* ("cosmic ray") that
   perturbs operand/register arithmetic, and the *move/copy mutation* that
   corrupts bytes as they are written by `mov*` instructions.
2. **Divide-time genetic operators** applied once to the daughter at the moment
   a cell divides, dispatched by `GeneticOps()` (`operator.c:111`). These are the
   size-preserving mutation/same-size crossover and the size-changing
   insertion / deletion / crossover, each at instruction granularity and at
   segment (Nop0/Nop1-delimited) granularity.

Every operator's rate is a user parameter expressed as **"generations per
event"** (`GenPer*`, defaults in `soup_in.h:62-73`). The three continuous
operators convert that into an integer **period** `Rate*` (recomputed each
million-instruction interval by `CalcFlawRates()`, `bookeep.c:1237`) and fire
via a saturating counter `Count* >= Rate*`. The divide-time operators use the
`GenPer*` value **directly** as the modulus of a `tlrand() % GenPer*` Bernoulli
test — so those are *not* rescaled by soup/genome size.

The **genebank** is the bookkeeping and archival subsystem: it recognizes each
distinct genome, gives it a `size+label` name (e.g. `0080aaa`), tracks its
population/demographics in RAM (`SList`/`GList`), and (optionally) writes it to
an on-disk XDR archive keyed by size. It is only active when `GeneBnker` is set.

---

## Section 1 — Variation Operators

### 1.1 Background mutation — `mutate()` / `mut_site()`

- **What:** Randomly hits one instruction *anywhere in the soup* and either
  bit-flips it or replaces it with a random opcode. This is the "radiation
  hitting live memory" operator.
- **How:** In the per-instruction system loop `SystemWork()`, a saturating
  counter fires the event: `if (RateMut && ++CountMutRate >= RateMut) { mutate();
  ... CountMutRate = tlrand() % RateMut; }` (`tierra.c:682-686`). `mutate()`
  picks a uniform soup address `i = tlrand() % SoupSize`, calls `mut_site(soup+i,
  0)`, then does mutation bookkeeping so the affected cell(s) get renamed
  (`operator.c:189-203`). `mut_site` (`operator.c:215-234`): with probability
  `MutBitProp` it XORs one random bit `s[0] ^= (1 << (tirand() % InstBitNum))`,
  otherwise `s[0] = tirand() % InstNum` (whole-instruction random replacement).
- **Params:** `GenPerBkgMut = 16` (`soup_in.h:62`). Derived period:
  `RateMut = (I32s)(pop_gen_time * 2.0 * GenPerBkgMut * prob_of_hit)` where
  `pop_gen_time = AvgPop*RepInst` and `prob_of_hit = AverageSize/SoupSize`
  (`bookeep.c:1250-1253`). Counter `CountMutRate`, total `TotMut`
  (`globals.h:229-231`).
- **Code:** `operator.c:189` (`mutate`), `operator.c:215` (`mut_site`),
  `tierra.c:682` (dispatch), `bookeep.c:1251` (rate).
- **Notes:** Because the target is uniform over `SoupSize` but only live genetic
  memory "counts" biologically, `prob_of_hit = AverageSize/SoupSize` scales the
  period so the *per-generation* mutation load stays roughly constant as the soup
  fills. `mut_site` is the shared primitive reused by MovMut and DivMut.

### 1.2 Flaw ("cosmic ray") — `flaw()`

- **What:** A transient arithmetic error injected into operand/register value
  computation during instruction *decode*. It does **not** corrupt stored code;
  it perturbs the effective value used by an instruction this one time,
  returning `+1` or `-1` to be added into a decoded register/offset value.
- **How:** `flaw()` (`instruct.c:2990-3001`) is a saturating counter identical in
  shape to the others: `if (RateFlaw && ++CountFlaw >= RateFlaw) { CountFlaw =
  tlrand() % RateFlaw; TotFlaw++; ce->d.flaw++; ce->d.nonslfmut=1; return
  (tcrand()%2) ? 1 : -1; } return 0;`. It is invoked inline throughout
  `decode.c` wherever a register/offset is resolved, e.g. `is.sval =
  ce->c.c->re[mo(tval,NUMREG)] + flaw()` (`decode.c:41`, and ~90 more call sites
  in `decode.c`).
- **Params:** `GenPerFlaw = 32` (`soup_in.h:63`). Derived period:
  `RateFlaw = (I32s) RepInst * GenPerFlaw * 2L` (`bookeep.c:1254-1255`). Counter
  `CountFlaw`, total `TotFlaw` (`globals.h:220-223`).
- **Code:** `instruct.c:2990` (`flaw`), `decode.c` (call sites), `bookeep.c:1255`
  (rate).
- **Notes:** A flaw sets `ce->d.flaw` and `ce->d.nonslfmut`, marking the cell as
  having diverged; the ±1 return value corrupts arithmetic (address calc, register
  math), which can e.g. mis-place a copied byte or mis-count a loop. Unlike
  `mutate`, no soup byte is changed by `flaw()` itself.

### 1.3 Move / copy mutation — MovMut

- **What:** Corrupts a byte *as it is being copied* by the `mov*d*i*` family of
  instructions (the copy loop a replicator uses to build its daughter). This is
  the dominant source of heritable point mutation in a healthy replicating soup.
- **How:** Inside the byte-copy loop of the move instructions, after `*(is.dins)
  = *(is.sins)`, a saturating counter fires: `if (RateMovMut && ++CountMovMut >=
  RateMovMut) { mut_site(soup + ad(is.dval), is.dtra); CountMovMut = tlrand() %
  RateMovMut; TotMovMut++; ce->d.nonslfmut=1; }` (`instruct.c:1863-1869`). It
  reuses `mut_site`, so it too obeys `MutBitProp`.
- **Params:** `GenPerMovMut = 8` (`soup_in.h:64`). Derived period:
  `RateMovMut = (I32s) 2L * GenPerMovMut * AverageSize * PLOIDY`
  (`bookeep.c:1241-1242`). Counter `CountMovMut`, total `TotMovMut`
  (`globals.h:224-227`).
- **Code:** `instruct.c:1864` (dispatch), `operator.c:215` (`mut_site`),
  `bookeep.c:1242` (rate).
- **Notes:** The default (8) makes this the highest-rate operator; it applies
  the mutation to the *destination* address just written, so the error is
  immediately heritable in the daughter.

### 1.4 Divide mutation — `MutationOps()`

- **What:** A point mutation applied to the daughter's genetic memory at the
  moment of divide.
- **How:** `MutationOps()` (`operator.c:243-253`) is a `while` loop of Bernoulli
  trials directly on the parameter: `while (GenPerDivMut && !(tlrand() %
  GenPerDivMut)) { TotDivMut++; ... site = DaughtGenStart + (tlrand() %
  DaughtSize); mut_site(soup + ad(site), 0); }`. The daughter span is
  `[ce->md.p + ce->d.MovOffMin, +DaughtSize)`.
- **Params:** `GenPerDivMut = 64` (`soup_in.h:65`). **No `Rate*` rescaling** —
  the raw `GenPerDivMut` is the modulus. Total `TotDivMut` (`globals.h:204-205`).
- **Code:** `operator.c:243`, dispatched first in `GeneticOps()` after
  `MutationOps()` call at `operator.c:112`.
- **Notes:** The `while(!(tlrand()%N))` idiom yields a geometric number of
  events per divide (usually 0, occasionally ≥1). Shared by all divide-time
  operators below.

### 1.5 Instruction-level size-changing operators

All dispatched by `GeneticOps()` (`operator.c:111-120`) on each divide, each a
`while (GenPer* && !(tlrand()%GenPer*))` loop. They select fragments and hand
them to `SharedGenOps()` (`operator.c:357`), which assembles the new daughter
(`AssembleDaught`, `operator.c:332`), rejects out-of-bounds sizes
(`MaxMalMult`, `MinCellSize`, `MinGenMemSiz`, `MovPropThrDiv` threshold), and
re-`mal()`s the daughter cell if its size changed.

- **CrossoverInstSamSiz — `CrossoverInstSamSiz()`** (`operator.c:293`).
  **What:** size-preserving crossover: copies a random prefix or suffix from a
  same-size mate into the daughter. **How:** finds a mate of the daughter's size
  within `MateSizeEp` via `FindRandCellOfSize`, picks a cross point, `CopyCode`s
  one side. **Params:** `GenPerCroInsSamSiz = 64` (`soup_in.h:66`), mate tolerance
  `MateSizeEp = 1` (`soup_in.h:84`). Total `TotCroInsSamSiz`. **Notes:** dispatched
  before the size-changing ops; does not call `SharedGenOps`.
- **CrossoverInst — `CrossoverInst()`** (`operator.c:533`). **What:**
  different-size crossover at instruction boundaries — joins a daughter chunk to
  a mate chunk about independent cross points. **Params:** `GenPerCroIns = 64`
  (`soup_in.h:69`). Total `TotCroIns`.
- **InsertionInst — `InsertionInst()`** (`operator.c:437`). **What:** inserts a
  randomly chosen sub-run (`MateChunk`) from a random mate at a random offset in
  the daughter (2- or 3-fragment assembly). **Params:** `GenPerInsIns = 64`
  (`soup_in.h:67`). Total `TotInsIns`.
- **DeletionInst — `DeletionInst()`** (`operator.c:499`). **What:** deletes a
  contiguous run of up to half the genome (`DelSiz = 1 + tlrand() %
  (ODaughtGenSize/2)`). **Params:** `GenPerDelIns = 64` (`soup_in.h:68`). Total
  `TotDelIns`.
- **Code:** `operator.c:437/499/533` + `SharedGenOps` `operator.c:357`.
- **Notes:** Mates are chosen with `RandomCell(ce)` (`operator.c:158`), a uniform
  draw over the live slicer queue. All size changes are gated by `SharedGenOps`
  returning nonzero (rejected), in which case the operator aborts.

### 1.6 Segment-level size-changing operators

Same dispatch, but fragment boundaries fall on **segments** — runs delimited by
`Nop0`/`Nop1` templates. Segment machinery:

- `CountSegments(Adr, Siz)` (`operator.c:601`): counts Nop0/Nop1-bounded
  segments; the sequence `inc Nop0 inc` counts as two.
- `FindStartSegN(Adr, Siz, SegN)` (`operator.c:639`): soup offset of segment N's
  start (including its leading template).
- `FindEndSegN(Adr, Siz, SegN)` (`operator.c:679`): soup offset of segment N's
  end (excluding trailing template).
- `IsNop(inst)` (`operator.c:580`): `*inst == Nop0 || *inst == Nop1`.

Operators:

- **CrossoverSeg — `CrossoverSeg()`** (`operator.c:853`). **What:** crossover at
  segment boundaries between daughter and a random mate; requires ≥2 segments in
  each; cross segments chosen `2 + tlrand()%(N-1)`. **Params:** `GenPerCroSeg =
  64` (`soup_in.h:72`). Total `TotCroSeg`.
- **InsertionSeg — `InsertionSeg()`** (`operator.c:779`). **What:** inserts a
  whole-segment chunk of a random mate at a segment boundary of the daughter
  (2/3-fragment). **Params:** `GenPerInsSeg = 64` (`soup_in.h:71`). Total
  `TotInsSeg`.
- **DeletionSeg — `DeletionSeg()`** (`operator.c:721`). **What:** deletes up to
  half the *segments* of the genome (`DelNumSeg = 1 + tlrand()%(N/2)`); removes
  the preceding template but not the following one. **Params:** `GenPerDelSeg =
  64` (`soup_in.h:70`). Total `TotDelSeg`.
- **Code:** `operator.c:721/779/853`, `CountSegments`/`FindStartSegN`/
  `FindEndSegN` `operator.c:601/639/679`.
- **Notes:** Segment operators respect gene/template structure, so they are more
  likely than the instruction-level ones to produce a still-viable rearrangement.

### 1.7 `MutBitProp` and the dispatch order

- **`MutBitProp = (float).2`** (`soup_in.h:73`): the fraction of `mut_site`
  events that are single-bit flips; the remaining 0.8 are whole-instruction
  random replacements (`operator.c:218`). It governs *all three* users of
  `mut_site` (background, move, divide mutations).
- **`GeneticOps()`** dispatch order (`operator.c:111-120`): `MutationOps` →
  `CrossoverInstSamSiz` → `CrossoverInst` → `InsertionInst` → `DeletionInst` →
  `CrossoverSeg` → `InsertionSeg` → `DeletionSeg`. Called from `divide()` in
  `instruct.c`.
- **`CalcFlawRates()`** (`bookeep.c:1237-1256`) recomputes `RateMovMut`,
  `RateMut`, `RateFlaw` each interval from the live `AverageSize`/`AvgPop`/
  `RepInst`; the divide-time `GenPer*` values are used raw. Counters
  `CountMutRate/CountFlaw/CountMovMut` are zeroed at setup (`tsetup.c:2687`) and
  persist in the soup checkpoint (`tsetup.c:3436-3449`, `4019-4051`).

**Rate → probability mapping (summary).** For the three continuous operators the
period `Rate*` is an integer count of eligible events between firings; the
per-event probability is `1/Rate*` (a saturating counter reset to a random phase
`tlrand()%Rate*` after each fire, giving uniform phase). Larger `GenPer*` ⇒
larger `Rate*` ⇒ rarer. For divide-time operators the per-divide trial
probability is `1/GenPer*` per loop iteration (geometric count of events).

---

## Section 2 — The Genebank

The genebank is active only when `GeneBnker` is nonzero (`soup_in.h:372`,
default 0 in the shipped file; the runnable `si*` soup-in files enable it). It
has a **RAM half** (`rambank.c`) and a **disk half** (`diskbank.c`/`genio.c`).

### 2.1 Genotype naming — `size + 3-char label`

- **What:** Each distinct genome is named `<4-digit size><3-letter label>`,
  e.g. `0080aaa`. Labels are a base-26 counter over `a..z`.
- **How:** `Int2Lbl(i)` (`portable.c:2114-2156`) maps an integer index to the
  label: `s[0]='a'+i/676; i%=676; s[1]='a'+i/26; s[2]='a'+i%26;` (default build).
  `i < 0` ⇒ `"---"` (unnamed/mutant-in-progress). The inverse `Lbl2Int(s)`
  (`portable.c:2088-2104`): `index = (s[2]-'a') + 26*(s[1]-'a') + 676*(s[0]-'a')`.
  With `BIGNAMES` the base is 52 (`a-z`,`A-Z`) giving mixed-case labels.
- **How labels increment:** the index is the *slot index* `gi` within the size
  class's `GList*` array (`sl[size]->g[gi]`). `NewGenotype` (`rambank.c:837`)
  reuses the first empty slot or appends (`a_num += 4`), so the label
  `aaa,aab,...` tracks the order in which genotypes of that size first appeared
  and were assigned a live slot.
- **Code:** `portable.c:2114` (`Int2Lbl`), `portable.c:2088` (`Lbl2Int`),
  `rambank.c:883` (label assignment on new genotype).
- **Notes:** The label is not globally unique — it is unique *within a size
  class*. Full identity is `(size, label)`; the `hash` (below) disambiguates.

### 2.2 In-memory structures — `GList` / `SList` / `GenDef`

- **`GList` (`struct g_list`, `tierra.h:1188-1218`):** one per genotype. Fields:
  `pop`/`origpop` (adults now / originally of this genotype), `gen`/`parent`
  (Genotype = size+label), `mg` (genetic-memory offset/size), `hash`, `bits`
  (32-bit trait field, semantics enumerated `tierra.h:825-859`: bit0 = permanent
  name / saved to `.gen`, bit1 = extinct-and-returned-below-threshold, bits 2-31
  = execution/template/move trait flags), `d1`/`d2` (`Metabolism` for each
  daughter), `originI`/`originC`, `MaxPropPop`/`MaxPropInst`/`MaxPop`/`mpp_time`,
  `ploidy`, `genome` (`FpInst`), `gbits`, `max_cpus`, thread-analysis data.
- **`SList` (`tierra.h:861-882`):** one per **size class**. `num_c` (# adults of
  this size), `num_g` (# extant genotypes), `a_num` (allocated length of `g`),
  `g` (`GList**` indexed by `gi`), `hash` (parallel hash array for fast lookup),
  `AvgRpdEff[2]`/`AvgEffCnt[2]` (size-class mean reproduction efficiency =
  instructions-executed / bytes-copied, per daughter), `slst_gendef`/`genelkup`
  (gene definitions). The global `sl[]` (length `siz_sl`) is the top-level array
  indexed by size.
- **`GenDef` (`tierra.h:803-814`):** a named gene within a genome — `gdf_name`,
  `gdf_start`, `gdf_end`, `gdf_typ` (0 ordinary / 1 dev), `gdf_cmnt`.
- **Notes:** `hash` (`Hash()`, `genio.c:781-798`): `h = (3*h + inst) %
  277218551` over the genetic-memory bytes; the prime modulus makes accidental
  collisions rare. The parallel `SList.hash[gi]` lets `IsInGenQueue`/`IsInGenBank`
  screen candidates before the full `IsSameGen` byte compare.

### 2.3 In-memory operations

- **`CheckGenotype(cd, flags, lsiz_sl, lsl)`** (`rambank.c:42-67`): the entry
  point. New size ⇒ `NewSize`; then tries `IsInGenQueue` (already in RAM), then
  `IsInGenBank` (on disk, load it), else `NewGenotype`. `flags` bits: 1=check
  `.gen`, 2=check `.tmp`, 4=check-files-anyway (soup startup), 8=preload all
  files of a size (cumulative bank / old-soup startup), 16=clear `bits` bit1 on
  read.
- **`NewGenotype`** (`rambank.c:837-903`): allocates a `GList`, copies the
  genome, assigns slot `gi` + label, sets `origin*`, `parent`, `mg`, `hash`,
  `bits=0`.
- **`DivGenBook(cp, InstExe, reaped, mom, same, disk, mutflag)`**
  (`rambank.c:80-239`): updates demographics on divide. For the mother: records
  `d1`/`d2` metabolism, updates `AvgRpdEff`. For the daughter: bumps `pop`,
  `num_g`, `num_c`, `NumGenotypes`, `MaxProp*`, and applies the **save policy**
  (2.6). Injections set `bits` bit0.
- **`ReapGenBook(cp, mutflag)`** (`rambank.c:247-402`): on death decrements
  `pop`/`origpop`; when a genotype hits zero it frees the `GList` (unless bit0
  permanent, in which case it is `extract`ed and the slot marked `(Pgl)1` =
  "on disk"), and rolls back `AvgRpdEff`.
- **`IsInGenBank` / `IsInGenQueue`** (`rambank.c:671-825` / `624-663`): hash-then-
  `IsSameGen` lookup against RAM (`IsInGenQueue`) or the disk `.gen`/`.tmp`
  archive (`IsInGenBank`, which faults the genome into RAM on a match).
- **`GBGarbageCollect()`** (`rambank.c:1273+`, called from `stats()`
  `bookeep.c:423`): frees `GList`s with `pop==0 && origpop==0 && !bit0`, and
  trims trailing empty slots from each size class.
- **`VerifyGB(zeropopchk, cellgbgenchk)`** (`rambank.c:956-1264`, only under
  `ERRORTIE`): rebuilds a shadow genebank from the live cells array and asserts
  it matches `sl[]` on `NumCells`/`NumGenotypes`/`NumSizes`/per-genotype `pop` +
  hash consistency; also sanity-checks CPU/`MovOff*` fields.
- **Notes:** A slot value `(Pgl)1` means "permanent, on disk, not resident";
  `TNULL()` distinguishes resident pointers from the sentinel. `gq_read`
  (`rambank.c:912`) faults such a genotype back from `.gen`/`.mem`.

### 2.4 On-disk banker — `DiskBank` / `GeneBnker`

- **What:** Optional persistence of genotypes to per-size XDR archive files in
  `GenebankPath` (default `"gb/"`, `soup_in.h:126`; `":gb:"` on Mac). `DiskBank`
  (`soup_in.h:19`, default 1) toggles disk archiving; `GeneBnker`
  (`soup_in.h:372`) toggles the whole genebank.
- **Open/create:** `open_ar(file, size, mode)` (`genio.c:1383-1420`): `mode<0`
  create-if-missing, `mode>0` force-create, else open `r+b`; on create it writes
  a zeroed `head_t` with `head.size=size` and a 1 KB-rounded index allocation
  (`n_alloc`).
- **Read/write header & index:** `read_head`/`write_head`
  (`genio.c:1231/808`), `read_indx`/`write_indx` (`genio.c:1261/837`) — all XDR
  via `txdr_head_t`/`txdr_GBindx_t`; encoded struct sizes are precomputed once by
  `enc_size_precomp()` (`genio.c:882`) into `prcencsize`.
- **Add/read a genome:** `add_gen` (`genio.c:590-709`) appends or replaces an
  entry (shifting later data if the encoded size changed) and rewrites index +
  header; `get_gen` (`genio.c:1316+`) reads one back; `find_gen` locates by
  label. `extract()` (`diskbank.c:327-397`) is the top-level "write this genotype
  to `<size>.gen`" call.
- **Notes:** There is no explicit "Start/Stop/Open/Close" session object — the
  disk bank is stateless per operation: each `extract`/`gq_read`/`GetAGen` opens,
  seeks, reads/writes, and closes the size-specific archive. `GetAGen`
  (`diskbank.c:245`) tries `.gen` then `.tmp`.

### 2.5 Archive file format — `head_t` + index + data

Layout of a `<size>.gen` (or `.tmp`/`.mem`/`.smp`) file, all XDR-encoded:

1. **`head_t`** (`genebank.x:12-21`, `genebank.h:17-27`): `g_off` (highest data
   offset used +1), `size` (genome size this file holds), `n` (# genomes),
   `n_alloc` (allocated index slots), `n_thread`, plus `hdsucsiznslrat` /
   `hdsvsiznsl` / `hdsvsucsiznsl` (previous-million divide-success stats).
2. **Index array** of `n_alloc` × **`indx_t`** (`genebank.x:39-63`,
   `genebank.h:54-77`), fixed-width so entries can be found by offset.
3. **Data region**: per-genome XDR blob = genome (`GBGenome`) + gene-bits
   (`GBGenBits`) + thread-analysis data, pointed to by `indx_t.g_off`.

**`indx_t` fields** (`genebank.x:39-63`): `gen[4]` (this genome's 3-char label),
`pgen[4]` (parent label), `psize` (parent size), `mg` (genetic-memory
offset/size), `hash`, `bits` (trait field), `originC`/`originI` (clock/instr time
of origin), `mppT` (last MaxPropPop update time), `mpp`/`mpi`
(MaxPropPop/MaxPropInst × 10000, stored as shorts — see `add_gen`
`genio.c:681-682`), `MaxPop`, `d1`/`d2` (`Metabolism`: `inst`, `instP`, `flags`,
`mov_daught`, `BreedTrue` — `genebank.x:31-37`), `pt` (`ploidy<<4` + track),
`max_cpus`, `g_off` (data offset of this genome). Under `NET`, three extra
divide-success rate fields.

### 2.6 Save policy — when a genotype reaches disk

Applied in `DivGenBook` (`rambank.c:202-216`) on each daughter birth, gated on
`reaped` (reaper has begun acting):

```
if (reaped && tgl->pop >= SavMinNum &&
    ((tgl->MaxPropInst > SavThrMem*.5) || (maxi > SavThrMem*.5)))
{   if not bit0: set bit0, clear bit1, extract(...,0,...)   // permanent .gen
    if bit0 && bit1: clear bit1, extract(...,1,...)         // .tmp re-save
}
```

- **`SavMinNum = 2`** (`soup_in.h:29`): minimum concurrent population before a
  genotype is worth saving.
- **`SavThrMem = .015`** (`soup_in.h:30`): memory-occupancy threshold (compared
  at half-value against `MaxPropInst`/`maxi`).
- **`SavThrPop = .015`** (`soup_in.h:31`): population-proportion threshold
  (parallel criterion in the size-class stats path).
- **`CumGeneBnk = 0`** (`soup_in.h:17`): if set, sets `CheckGenotype` flag bit3
  so old archives accumulate rather than being overwritten (`rambank.c:487`,
  `diskbank.c:74`).
- **`SaveFreq = 100`** (`soup_in.h:27`): every `SaveFreq` million instructions
  the whole run checkpoints (`WriteSoup`, `tierra.c:716`).
- **`SavRenewMem = 1`** (`soup_in.h:28`): after each checkpoint, free and re-read
  all dynamic memory + genebank to defragment (`tierra.c:718-735`).
- **`TierraLog = 0`** (`soup_in.h:32`): if set, writes an `ex = <genotype>` line
  to `tierra.log` on each extraction (`diskbank.c:356-357`).
- **Notes:** bit0 ⇒ the name is permanent and lives in `.gen`; bit1 marks a
  genotype that was saved, went extinct, and reappeared but has not re-crossed
  threshold — kept in `.tmp` until it re-qualifies.

### 2.7 Size-class lists & reproduction efficiency

- **`sl[]` / `siz_sl`**: the global `SList*` array, indexed directly by genome
  size, so lookup by size is O(1). Within a size, `SList.hash[]` gives a fast
  pre-filter before the exact `IsSameGen` compare (2.3).
- **`AvgRpdEff[2]`** (`tierra.h:867`): running mean, per daughter (1st/2nd), of
  reproduction efficiency = `d.instP / d.mov_daught` (parallel instructions
  executed per byte copied), maintained incrementally in `DivGenBook`
  (`rambank.c:121-149`, `219-237`) and rolled back in `ReapGenBook`
  (`rambank.c:280-308`). `AvgEffCnt[2]` is the sample count.
- **Notes:** This is Tierra's core fitness proxy — lower CPU-cycles-per-byte
  means a faster replicator. It is aggregated at the size-class level so the
  front end can display which sizes host the most efficient replicators.

---

## Requirement vs incidental

**Requirement (core to the model's identity):**

- The three continuous operators — background mutation, flaw, and move mutation —
  with `mut_site` + `MutBitProp` as the shared point-mutation primitive. These
  are what make Tierra *evolve*; without them the soup is static.
- The rate model: `GenPer*` "generations per event" params rescaled to a period
  `Rate*` by `CalcFlawRates()` using live `AverageSize`/`AvgPop`/`RepInst`, fired
  by a saturating counter. Size-aware rescaling keeps mutation load per generation
  stable as population changes — essential to the intended dynamics.
- Genotype identity by `(size, hash, exact-genome)` and naming by `size+label`;
  the `GList`/`SList` demographic bookkeeping and reaper-driven population
  tracking. The genebank *is* how Tierra observes speciation.
- The divide-time genetic operators (`GeneticOps`) collectively — recombination
  and indels are what let genome *size/structure* evolve, not just point mutation.

**Incidental (engineering / optional):**

- The on-disk XDR archive format (`head_t`/`indx_t`, `.gen`/`.tmp`/`.mem`/`.smp`
  files, `add_gen` data-shifting, `enc_size_precomp`). This is persistence and
  cross-platform serialization; the evolutionary model runs entirely from the RAM
  bank. `DiskBank`, `CumGeneBnk`, `SaveFreq`, `SavRenewMem`, `TierraLog` are all
  operational conveniences.
- Segment-vs-instruction granularity as *separate* operators, and
  `CrossoverInstSamSiz` as a distinct same-size path — refinements over a single
  generic recombination operator.
- `VerifyGB` (debug-only under `ERRORTIE`), thread-analysis data in `GList`/
  archive, the `NET`-only divide-success-rate fields, `BIGNAMES` mixed-case
  labels, EBCDIC/IBM3090 conversions.
- `AvgRpdEff` and the `MaxProp*` statistics — informative for observation but not
  inputs to selection (selection is purely CPU-time + reaper-queue driven).
