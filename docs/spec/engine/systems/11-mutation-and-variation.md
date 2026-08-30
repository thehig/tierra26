# Mutation & Variation — Engineering Spec              (Code: MUT · Milestone: M1)

**Status:** v1. The **source of evolution** — the one system whose job is to make copies
*differ* from their originals. **Seams exist in M0** (interface present, all rates default 0,
so the ancestor breeds true and golden runs are pure); the behavior specified here **goes
live in M1**. This is the only system whose absence is not a bug in M0 and whose presence is
the whole point in M1.

**Upstream refs:**
[`00-architecture.md`](00-architecture.md) §5 (C-DET single-RNG fixed order, C-INT, C-PROT,
C-SNAP), §6 (glossary: *flaw*, *genome*, *daughter*) ·
[`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md) §7 (flaws & mutation at the ISA level), §3.1 +
§8 (**mutation domain = low `bitWidth` bits, value `mod n` ⇒ always a valid opcode**), §4.2
(operand reads perturbed ±1 by `flaw()`), §4.5 (`movii` copy family, write-protection) ·
[`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §12 (`mutation.ts` seams, `Mutation` interface,
rates 0 in M0), §5 (handler shape calling `maybeCopyFlaw`), §6 (decode routes operand reads
through `maybeFlaw` in M1).
**Reference (fidelity — the authoritative account):**
[`docs/original-tierra/05-genetics-genebank.md`](../../../original-tierra/05-genetics-genebank.md)
§1 in full — background mutation (`mutate`/`mut_site`, `tierra.c:682`, `operator.c:189,215`),
flaw (`instruct.c:2990`, ~90 `decode.c` call sites), move/copy mutation (`instruct.c:1863`),
divide-time operators `MutationOps`/`InsertionInst`/`DeletionInst`/`CrossoverInst`/
`CrossoverInstSamSiz` + segment variants (`operator.c:111-120,243-533,721-853`), the
`GenPer*` "generations per event" → `Rate*` period model (`bookeep.c:1237-1256`,
`CalcFlawRates`), and `MutBitProp=0.2` (`soup_in.h:73`, `operator.c:218`).

**Contracts obeyed:** **C-DET** (every draw from the single `world.rng` in a fixed,
documented order — the crux of this system's correctness), **C-INT** (rates, periods,
counters, sites, bit indices are all integers; the `GenPer*`→period conversion is integer),
**C-PROT** (a copy mutation still writes only through a protected `soup.write`; it never
escapes the daughter/own cell), **C-ADDR** (cosmic-ray site via `ad()`), **C-SNAP** (all
mutation state — the saturating counters — lives in `World`, serialized with the snapshot).

---

## 1. Purpose & responsibility

This system owns **all heritable and operational variation** in the engine: the ways a
creature's execution or a daughter's genome can come out different from a faithful copy. It
is the mechanism selection acts on — with it off, the soup is a static clonal monoculture;
with it on, parasites, size reduction, and optimization emerge. It owns two families:

1. **Continuous channels** (fire during ordinary execution, throttled by a saturating
   counter): **flaw** (±1 perturbation of a decoded operand/result — the genome is unchanged
   but one execution goes slightly wrong), **copy mutation** (bit-flip of the byte written by
   the `movii`/`movid` copy loop — the daughter's stored code differs from the mother's), and
   **cosmic ray** (a uniformly random soup byte is bit-flipped independent of execution).
2. **Divide-time operators** (fire once, on the daughter, at the moment of `divide`): point
   mutation, and the size-changing **insertion / deletion / crossover** at both instruction
   and segment (`nop`-delimited) granularity, plus **same-size crossover**.

It guarantees: (a) **at rate 0, nothing mutates** — the ancestor breeds true, golden runs
stay pure (the M0 seam); (b) every mutation that touches a genome byte yields a **valid
opcode** (mutation domain = low `bitWidth` bits `mod n`, ISA-VM-SPEC §3.1/§8); (c) every
random decision draws from the **single `world.rng` in a fixed call order** so a seed
reproduces a run bit-for-bit (C-DET); (d) a rate expressed as `GenPer*` "generations per
event" converts to a per-event probability **deterministically and in integer arithmetic**.
It performs no reaping, no birth bookkeeping, and no genotype naming — those are the reaper
`[10]` and genebank `[12]`; mutation only *changes bytes and values*.

---

## 2. Interfaces

Defined in `packages/engine/src/mutation.ts`. Imports: `rng`, `isa/set`, `soup`, `types`.
Imported by: `isa/handlers` (copy mutation on `movii`/`movid`; passed `World` at call time),
`isa/decode` (flaw on operand resolution), `world` (owns the instance, drives `cosmicTick`
per instruction and the divide-time ops from the `divide` handler). It reaches **down** only
(module dependency graph, §[00].2) and never back up to `World`'s owner.

```ts
// mutation.ts — the single variation authority. World owns exactly one instance.
// Rates are integer PERIODS (see §4.1): 0 = OFF (M0 default), else "1 event per `rate`
// eligible ticks". Higher period ⇒ rarer, matching the GenPer* convention.
interface Mutation {
  // --- Continuous channels (execution-time) ---

  // Flaw: at the flaw period, return x + (±1); otherwise return x unchanged.
  // Called by decode.ts wherever a register/offset operand or a template landing
  // address is resolved (ISA-VM-SPEC §4.2, §5.2). M0: identity (rate 0).
  maybeFlaw(x: number): number;

  // Copy mutation: at the copy period, return `b` with one opcode bit flipped
  // (domain-clamped to a valid opcode); otherwise return `b`. Called by the movii/
  // movid handler on the byte about to be written. M0: identity (rate 0).
  maybeCopyFlaw(b: Opcode): Opcode;

  // Cosmic ray: once per executed instruction, at the background period, bit-flip
  // ONE uniformly-random soup byte to a valid opcode (independent of execution).
  // M0: no-op (rate 0).
  cosmicTick(soup: Soup, set: InstructionSet): void;

  // --- Divide-time operators (act between generations, once per divide) ---
  // Called by the divide handler on the freshly-filled daughter span, in the FIXED
  // dispatch order of §4.5. Each returns the (possibly rebuilt/resized) daughter
  // genome; a returned size != in size signals the caller to re-mal the daughter
  // cell before the new creature is registered. `mates` gives read access to the
  // live population's genomes (for insertion/crossover); drawn from the slicer queue
  // in order via world.rng (C-DET). M0: returns `daughter` unchanged (all rates 0).
  divideOps(daughter: Uint8Array, ctx: DivideCtx): Uint8Array;

  // Serialization seam: the saturating counters are engine state (C-SNAP).
  state(): MutationState;          // { flawCount, copyCount, cosmicCount }
  setState(s: MutationState): void;
}

// Per-channel configuration, resolved from Scenario.mutation (M0-TECH-DESIGN §14).
// Each field is a PERIOD in integer ticks; 0 disables the channel.
interface MutationRates {
  flaw: number;      // eligible-operand ticks per flaw       (Tierra GenPerFlaw=32)
  copy: number;      // copied bytes per copy mutation        (Tierra GenPerMovMut=8)
  cosmic: number;    // executed instructions per cosmic ray  (Tierra GenPerBkgMut=16)
  // divide-time trial moduli (probability 1/N per trial iteration), 0 = off:
  divMut: number; insInst: number; delInst: number; croInst: number; croSamSiz: number;
  insSeg: number;  delSeg: number; croSeg: number;
  mutBitPropPct: number;   // integer percent, default 20 → P(bit-flip) among mut_site events
}

// factory — bind the single rng + resolved rates.
function makeMutation(rng: Rng, rates: MutationRates): Mutation;
```

- All fields default to `0` in M0 (`Scenario.mutation = { flaw:0, copy:0, cosmic:0, ... }`),
  so every method is the identity/no-op and the ancestor breeds true.
- `maybeFlaw`/`maybeCopyFlaw` are the two hot-path calls; they are cheap (`++count >= period`
  guard) and only draw from `rng` on the rare firing tick.
- `mutBitPropPct` is an **integer percent** (default `20`), not a float — C-INT. It splits
  every `mut_site`-style event into bit-flip (`< 20`) vs whole-instruction replacement.

---

## 3. Data structures

Mutation holds only **saturating counters** (the throttles). Everything else is derived from
`rng` + `set` + the requested rates. No genome bytes are stored here.

| Field | Type | Units / domain | Why |
|---|---|---|---|
| `flawCount` | `number` (int ≥ 0) | eligible operand ticks since last flaw | saturating throttle for flaw |
| `copyCount` | `number` (int ≥ 0) | copied bytes since last copy mutation | saturating throttle for copy mutation |
| `cosmicCount` | `number` (int ≥ 0) | executed instructions since last cosmic ray | saturating throttle for cosmic ray |
| `rates` | `MutationRates` | integer periods + moduli + `mutBitPropPct` | resolved once from the scenario |

**The saturating-counter model** (Tierra `Count* >= Rate*`, `05-genetics-genebank.md` §1.1):
each continuous channel increments its counter on every eligible tick; when
`++count >= period` the event fires and the counter resets to a **random phase**
`rng.int(period)` (uniform phase, so events don't lock-step). Period `0` ⇒ the channel is
disabled and its counter never moves (the M0 case).

Invariants:
- **MUT-COUNTER-INT:** all counters and periods are integers ≥ 0; no float ever enters a
  fate-bearing path (C-INT).
- **MUT-COUNTER-SNAP:** the three counters are the *entire* mutable state; `state()` returns
  them and `setState` restores them, so a snapshot resumes the mutation schedule exactly
  (C-SNAP, INV-ROUNDTRIP). No module-level mutable state.
- **MUT-DOMAIN-VALID:** every byte this system writes into soup is in `[0, n)` — produced by
  masking to the low `set.bitWidth` bits then `mod set.n` (§4.3). A mutation can never store
  an out-of-range opcode.

---

## 4. Behavior / algorithms

### 4.1 The rate model: `GenPer*` "generations per event" → integer period `[MOD, faithful]`

A user rate is **"generations per event"** (`GenPer*`): larger ⇒ rarer. The three continuous
channels convert this to an integer **period** `Rate*` (a count of eligible events between
firings), recomputed on a cadence from the live `averageSize`/`avgPop`/`repInst`
(`CalcFlawRates`, `bookeep.c:1237-1256`), and fire via the saturating counter of §3. **The
per-event probability is `1/period`.**

```
# Tierra's derivations (05-genetics-genebank.md §1.1-1.3), all integer-floored:
periodFlaw   = repInst * GenPerFlaw * 2
periodCopy   = 2 * GenPerMovMut * averageSize          # size-aware: load/generation stable
periodCosmic = floor(popGenTime * 2 * GenPerBkgMut * probOfHit)
   where popGenTime = avgPop * repInst, probOfHit = averageSize / soupSize (integer-scaled)
```

- **[MOD] integer-only conversion.** Tierra computes these with `double` intermediates
  (`prob_of_hit`, `pop_gen_time`); we perform the size-aware scaling with integer/fixed-point
  arithmetic (multiply-before-divide, floor) so the derived period is bit-identical across JS
  engines (C-INT/C-DET). *Why:* determinism forbids float on a fate-bearing path.
- **[MOD, config simplification for M0/M1 defaults].** A scenario may specify the **period
  directly** (as in the `MutationRates` interface) instead of a `GenPer*` to be rescaled; the
  `GenPer*`→period rescaling is the faithful path and is what M1 uses when size-aware load is
  wanted. Either way the runtime firing test is identical: `++count >= period`.
- **Divide-time operators do NOT rescale** (`05-genetics-genebank.md` §1.4): the raw
  `GenPer*` value is used **directly as a Bernoulli modulus** — `while (N && !(rng.int(N)))`
  — giving a geometric count of events per divide, with per-trial probability `1/N`.

> **FIXME(rate→probability):** the two conversions are different and must not be confused. A
> **continuous** channel's `GenPer*` is rescaled into a *period* whose reciprocal is the
> per-tick probability; a **divide-time** channel's `GenPer*` is used *raw* as a `% N == 0`
> Bernoulli modulus per loop iteration. Rescaling a divide-time modulus (or failing to
> rescale a continuous one) silently changes the long-run mutation load. MUT-013/MUT-014
> pin the long-run frequency for each family separately.

### 4.2 Flaw — ±1 operand/result perturbation `[CORE]`

Genome-preserving, execution-only. Called inline from `decode.ts` wherever an operand
register/offset value or a template landing address is resolved (ISA-VM-SPEC §4.2, §5.2;
Tierra `decode.c:41` and ~90 sibling sites, `flaw()` at `instruct.c:2990`).

```
maybeFlaw(x):
    if rates.flaw == 0: return x                 # M0 / channel off
    if ++flawCount < rates.flaw: return x
    flawCount = rng.int(rates.flaw)              # reset to random phase (one draw)
    delta = (rng.int(2) == 0) ? -1 : +1          # ±1, one draw (fixed order: phase THEN sign)
    return x + delta
```

- The perturbed value flows through the normal integer wrap (C-INT); it can mis-place a
  copied byte, mis-count a loop, or mis-land a jump — a *transient* error, no soup byte
  changed. M0: identity (rate 0), so decode is exact.
- **Draw order is fixed:** on a firing tick, phase reset draws first, then the sign — pinned
  so the stream is reproducible (C-DET).

### 4.3 Copy mutation & the `mut_site` primitive — bit-flip vs replacement `[CORE]`

The dominant source of heritable point mutation. Fires inside the `movii`/`movid` copy loop,
on the **byte just written to the daughter** (Tierra `instruct.c:1863`, reusing `mut_site`).
`mut_site` is the shared primitive for copy, cosmic, and divide point mutation, and it obeys
`MutBitProp`.

```
mutSite(b):                                       # b is the current byte; returns a valid opcode
    if rng.int(100) < rates.mutBitPropPct:        # default 20% → single-bit flip
        bit = rng.int(set.bitWidth)               # only the low bitWidth bits carry the opcode
        v = b ^ (1 << bit)
    else:                                          # 80% → whole-instruction random replacement
        v = rng.int(set.n)                         # already in [0, n)
    return domainClamp(v)                          # mask low bitWidth bits, then mod n

domainClamp(v):                                    # ISA-VM-SPEC §3.1/§8 — always a valid opcode
    return (v & ((1 << set.bitWidth) - 1)) % set.n

maybeCopyFlaw(b):
    if rates.copy == 0: return b                   # M0 / channel off
    if ++copyCount < rates.copy: return b
    copyCount = rng.int(rates.copy)                # reset to random phase (one draw)
    return mutSite(b)                              # bit-flip OR replacement (further draws)
```

- **Exactly one opcode bit flips** on the bit-flip branch, and `domainClamp` guarantees a
  valid opcode either branch (MUT-DOMAIN-VALID). For `classic32`, `bitWidth = 5`, `n = 32`,
  so the mask covers exactly `[0,32)` and the `mod n` is a no-op; for a tutorial subset with
  `n` not a power of two the `mod n` folds the top of the mask range back in — still valid,
  possibly not uniform over opcodes (a known, accepted property; see §6).
- The mutated byte is written through `soup.write` **after** the handler's `canWrite` check
  (C-PROT): a copy mutation can only ever land inside the daughter/own cell — it never
  escapes protection. M0: identity, daughter == mother.

### 4.4 Cosmic ray — background soup bit-flip `[CORE]`

Independent of what any creature is executing. Driven once per executed instruction by the
step loop (Tierra `SystemWork()` dispatch, `tierra.c:682`; site pick `mutate()`,
`operator.c:189`).

```
cosmicTick(soup, set):
    if rates.cosmic == 0: return                   # M0 / channel off
    if ++cosmicCount < rates.cosmic: return
    cosmicCount = rng.int(rates.cosmic)            # reset to random phase (one draw)
    addr = ad(rng.int(soup.size))                  # uniformly random soup byte (one draw)
    soup.bytes[addr] = mutSite(soup.bytes[addr])   # bit-flip OR replacement; valid opcode
```

- The target is **uniform over the whole soup** (`rng.int(soupSize)`), not restricted to live
  cells — dead code and inter-cell gaps can be hit (Tierra faithful). It writes **directly**
  (no `canWrite`) because cosmic radiation respects no ownership — this is the one soup write
  in the engine not gated by C-PROT, and it is intentional (it models radiation, not a
  creature action).
- Site selection is `rng.int` (unbiased, rejection-sampled) so it is exactly reproducible and
  never modulo-biased (RNG §4.3). M0: no-op.

### 4.5 Divide-time operators — between-generation recombination & indels `[CORE]`

Fire once, on the daughter, from the `divide` handler, in a **fixed dispatch order** (Tierra
`GeneticOps()`, `operator.c:111-120`): `divMut → croSamSiz → croInst → insInst → delInst →
croSeg → insSeg → delSeg`. Each is a geometric `while` loop of Bernoulli trials on the raw
modulus (§4.1), with per-trial probability `1/N`:

```
divideOps(daughter, ctx):
    g = daughter
    g = pointMutate(g, rates.divMut)          # while(N && !rng.int(N)): mutSite a random byte
    g = crossoverSameSize(g, rates.croSamSiz, ctx)   # copy a random prefix/suffix from a same-size mate
    g = crossoverInst(g, rates.croInst, ctx)  # join daughter chunk + mate chunk @ instruction points
    g = insertInst(g, rates.insInst, ctx)     # splice a mate sub-run in at a random offset (size +k)
    g = deleteInst(g, rates.delInst)          # delete a run up to half the genome (size -k)
    g = crossoverSeg(g, rates.croSeg, ctx)    # crossover at nop-delimited SEGMENT boundaries
    g = insertSeg(g, rates.insSeg, ctx)       # insert a whole-segment chunk (size +k)
    g = deleteSeg(g, rates.delSeg)            # delete up to half the SEGMENTS (size -k)
    return g                                    # caller re-mals the daughter cell if size changed
```

- **Granularity.** Instruction-level operators cut at arbitrary byte boundaries; segment-level
  operators cut only at `nop0`/`nop1` template boundaries (Tierra `CountSegments`/
  `FindStartSegN`/`FindEndSegN`, `operator.c:601-679`), so they respect gene structure and
  more often yield a viable rearrangement.
- **Same-size crossover** (`croSamSiz`) copies a random prefix or suffix from a *same-size*
  mate (within `mateSizeEp`, Tierra 1) — size-preserving recombination; it does not resize.
- **Mate selection** draws a live creature uniformly from the slicer queue via `rng.int` over
  the population, read in queue order (C-DET, never map-iteration order). Insertion/crossover
  read the mate's current soup bytes.
- **Size changes** are validated (min cell size 12, `MovPropThrDiv` fill, max multiple) before
  acceptance, exactly as Tierra `SharedGenOps` (`operator.c:357`) rejects out-of-bounds sizes;
  a rejected operator aborts and leaves the daughter unchanged. If the accepted size differs,
  the caller re-`mal`s the daughter cell (§[08]/§[03]) before registering the new creature.
- Point mutation and all indels route byte changes through `mutSite`/`domainClamp`, so every
  produced byte is a valid opcode. M0: all moduli 0 ⇒ `divideOps` returns the daughter
  verbatim.

---

## 5. Interconnections

- **Called by `isa/decode.ts`:** `maybeFlaw(x)` on every resolved operand/offset and template
  landing (ISA-VM-SPEC §4.2, §5.2). M1 flips flaw on; M0 identity.
- **Called by `isa/handlers.ts`:** `maybeCopyFlaw(b)` inside `exec_movii`/`exec_movid`, on the
  byte between `soup.read(src)` and the protected `soup.write(dst)` (M0-TECH-DESIGN §5). The
  handler's `canWrite` gate runs **before** the write, so protection is never bypassed
  (C-PROT).
- **Called by `world.ts`:** `cosmicTick(soup, set)` once per `stepOne` (after execute, before
  the next fetch); and `divideOps(daughter, ctx)` from the `divide` handler path — on a size
  change, `world` re-`mal`s via the allocator `[03]` and then registers the daughter.
- **Draws from `rng.ts`:** the single `world.rng`, via `int(n)` (unbiased) and never
  `float01` on a fate path. Every draw site is fixed and ordered within this doc (§4.2–4.5) —
  this system is a primary **C-DET call-order** surface.
- **Reads `isa/set.ts`:** `bitWidth`, `n`, `nop0/nop1` for the mutation domain and segment
  detection. Never writes the set.
- **Serialized by `snapshot.ts`:** `state()`/`setState()` carry the three counters so a
  restored engine resumes the mutation schedule identically (C-SNAP, INV-ROUNDTRIP).
- **Feeds `genebank.ts` `[12]` / `reaper` `[10]` indirectly:** a mutated daughter that hashes
  differently is a new genotype; a flaw that raises `E` (bad address, div-by-0) nudges the
  creature up the reaper. Mutation itself fires no birth/death events.

---

## 6. Determinism & edge cases

- **Single-RNG fixed call order (C-DET).** Every stochastic decision uses `world.rng`; within
  a firing tick the order is pinned (phase reset → then the event's own draws). Across
  channels within one instruction the order is fixed by the step loop: decode-time flaws (in
  operand-resolution order), then the handler's copy mutation, then `cosmicTick`. Two runs
  with the same seed reject/fire at the same points.
  > **FIXME(single-RNG call-order stability):** because the count of `rng` calls per
  > instruction depends on *which* channels fire (and rejection sampling in `int`), any
  > reordering of draw sites — or adding a draw on a non-firing tick — desynchronizes the
  > entire downstream stream and breaks replay. The firing guard (`++count >= period`) MUST
  > draw **zero** words when it does not fire (period 0 or counter below threshold). MUT-002
  > and MUT-012 pin call-order stability; the golden-run digest (§[14]) is the backstop.
- **Rate 0 ⇒ pure (the M0 seam).** With every period/modulus 0, no counter advances and no
  `rng` word is consumed by mutation — the ancestor breeds true and golden runs are identical
  with mutation "present but off" vs. absent (MUT-001).
- **Mutation domain always valid (C-INT/ISA §3.1).** `domainClamp` masks low `bitWidth` bits
  then `mod n`; a bit-flip on `classic32` (`bitWidth=5,n=32`) trivially stays in `[0,32)`. For
  a subset with `n` not a power of two, values in `[n, 2^bitWidth)` fold back via `mod n`, so
  opcode distribution is *slightly* non-uniform but **every result is a legal opcode** — the
  guarantee that matters. MUT-003 asserts validity, not uniformity.
- **Copy mutation flips exactly one bit** on the bit-flip branch (MUT-004); the replacement
  branch changes the whole instruction (MUT-011). The two are split by `mutBitPropPct` (~20).
- **Cosmic ray writes unprotected, on purpose.** The only soup write not gated by `canWrite`
  (models radiation). All other channels respect C-PROT.
- **Integer conversion, floor semantics.** `GenPer*`→period uses multiply-before-divide and
  floors; the divide-time modulus is used raw. No float intermediates (C-INT). MUT-013 (period
  frequency) and MUT-014 (per-trial frequency) are checked over large samples with tolerance.
- **Snapshot mid-schedule.** Restoring in the middle of a counter's cycle resumes exactly
  (MUT-015) — the counters are snapshot state, not recomputed from cycle count.
- **Indel bounds.** Insertion/deletion/crossover that would violate min cell size,
  `MovPropThrDiv`, or max multiple are rejected and leave the daughter unchanged (§4.5);
  size-changing acceptance triggers a re-`mal`. MUT-009/MUT-010 assert the ±1 size delta for
  the minimal insert/delete case.

---

## 7. Fidelity notes

- **[CORE] The three continuous channels + `mut_site`/`MutBitProp`.** Background (cosmic),
  flaw, and move/copy mutation are *what make Tierra evolve* (`05-genetics-genebank.md`
  §"Requirement"). Preserved exactly: the saturating-counter firing, the ±1 flaw, the
  destination-byte copy mutation, and the shared `mut_site` primitive split by `MutBitProp`.
- **[CORE] Divide-time operators.** Insertion/deletion/crossover at instruction *and* segment
  granularity, plus same-size crossover, are what let genome **size and structure** evolve —
  not just point substitution. Preserved as a fixed-order dispatch of geometric Bernoulli
  loops.
- **[CORE] Mutation domain = valid opcode.** Low `bitWidth` bits `mod n` (ISA-VM-SPEC §3.1) —
  Tierra's cosmic-ray behavior; a mutation never yields garbage, only another instruction.
- **[MOD] Integer/fixed-point rate rescaling.** Tierra's `CalcFlawRates` uses `double`
  intermediates; we rescale in integer/fixed-point for cross-engine determinism (C-DET). The
  *model* — size-aware period so per-generation load stays stable — is unchanged.
- **[MOD] Unbiased site selection.** Tierra uses `tlrand() % N` (modulo-biased,
  `operator.c:161,193`) for sites/mates/bits; we use `rng.int(n)` (rejection-sampled) for
  exact uniformity. *Why:* the bias is a known defect; correctness is cheap.
- **[MOD] `MutBitProp` as integer percent.** Stored as `mutBitPropPct` (default `20`) not the
  float `.2` (`soup_in.h:73`) — same split, no float on the path.
- **[MOD] Rate 0 default in M0.** Tierra ships nonzero `GenPer*`; we default all to 0 so M0
  golden runs are deterministic and the ancestor breeds true. M1 turns them on.
- **[OPTIONAL] Genebank demographics / `AvgRpdEff` / disk archive.** Not this system —
  observation and persistence live in genebank `[12]`/stats `[13]`. Mutation only changes
  bytes and values.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[MUT-NNN] …')` in
`packages/engine/test/11-mutation.test.ts`. IDs are append-only.

- **MUT-001** At rate 0 nothing mutates: with all periods/moduli 0, `maybeFlaw(x)===x`,
  `maybeCopyFlaw(b)===b`, `cosmicTick` leaves the soup byte-identical, `divideOps` returns the
  daughter verbatim — and the ancestor **breeds true** (single genotype), so M0 golden runs
  are unaffected by mutation being present-but-off.
- **MUT-002** Rate 0 consumes no randomness: with mutation off, no `rng` word is drawn by any
  mutation call — the RNG stream (and thus every downstream draw) is identical to a run with
  no mutation seam at all (single-RNG call-order stability).
- **MUT-003** Mutation domain is always a valid opcode: for every branch (bit-flip,
  replacement, flaw-on-byte), the produced byte is in `[0, n)` — low `bitWidth` bits then
  `mod n` — for both `classic32` (n=32) and a non-power-of-two subset.
- **MUT-004** A copy mutation flips **exactly one** opcode bit (Hamming distance 1 from the
  source byte, within the low `bitWidth` bits) on the bit-flip branch, and the result is a
  valid opcode.
- **MUT-005** Cosmic ray targets a **uniformly random** soup byte, chosen **deterministically
  from the seed**: same seed ⇒ same address hit; over a large sample addresses are uniform
  over `[0, soupSize)` (unbiased, rejection-sampled) and no byte outside the picked site
  changes.
- **MUT-006** Flaw perturbs an operand by **exactly ±1**: on a firing tick `maybeFlaw(x)`
  returns `x±1` (never other deltas); off a firing tick it returns `x`; the ± sign is
  seed-deterministic.
- **MUT-007** Flaw leaves stored code unchanged: a flaw changes only the transient operand
  value, never any soup byte (genome-preserving, execution-only).
- **MUT-008** MutBitProp split: over a large sample of `mut_site` events, the fraction that
  are single-bit flips is ≈ `mutBitPropPct/100` (~0.2) and the rest are whole-instruction
  replacements, within tolerance and seed-deterministic.
- **MUT-009** Insertion changes genome size by the inserted length (the minimal single-instr
  insert case increases size by 1) and the result is all valid opcodes.
- **MUT-010** Deletion changes genome size by the deleted length (the minimal single-instr
  delete case decreases size by 1) and the result is all valid opcodes.
- **MUT-011** Whole-instruction replacement branch: on the non-bit-flip branch, `mut_site`
  replaces the byte with a uniformly random valid opcode (may differ in >1 bit), in `[0, n)`.
- **MUT-012** Fixed draw order & single RNG: all mutation randomness comes from the one
  `world.rng`; reordering channels or adding an off-tick draw changes the stream — same seed +
  same firing schedule ⇒ identical byte-level outcomes (call-order stability).
- **MUT-013** Continuous rate → frequency: a `GenPer*`/period channel fires at long-run
  frequency ≈ `1/period` (per eligible tick), deterministically for a fixed seed, within
  tolerance over a large sample.
- **MUT-014** Divide-time rate → frequency: a divide-time operator with modulus `N` fires with
  per-trial probability ≈ `1/N` (geometric event count per divide), deterministically for a
  fixed seed, within tolerance — and this raw-modulus mapping is distinct from the continuous
  period mapping (MUT-013).
- **MUT-015** Crossover recombines two genomes deterministically: given two fixed parent
  genomes and a fixed seed, crossover produces a byte-exact, reproducible child that is a
  recombination of the two (prefix/suffix or segment split), of a valid size and all valid
  opcodes.
- **MUT-016** Counter snapshot round-trip: `setState(state())` mid-schedule resumes the exact
  same firing sequence; the three saturating counters are the entire mutation state (C-SNAP).

---

## 9. Open questions

1. **Direct period vs. `GenPer*` rescale for M1 defaults.** Ship M1 with periods specified
   directly (simple, size-independent) or with the faithful size-aware `GenPer*`→period
   rescale (`CalcFlawRates`)? Propose: support both; default the classic `GenPer*`
   (`flaw=32, copy=8, cosmic=16`) rescaled, with a direct-period override for reproducible
   micro-tests. (Ties to MUT-013.)
2. **`avgSize`/`avgPop` cadence for size-aware periods.** How often to recompute the rescaled
   periods (each divide? each N cycles?) — must be deterministic and matches the `avgSize`
   cadence question in M0-TECH-DESIGN §18.2. Propose: recompute on the same cadence as
   `searchLimit`.
3. **Mate selection scope for divide-time ops.** Uniform over the whole live slicer queue
   (Tierra `RandomCell`) vs. a locality window? Propose: whole queue (faithful) for M1;
   revisit if it proves too disruptive.
4. **Non-power-of-two subset mutation uniformity.** For tutorial subsets where `n` is not a
   power of two, the `& mask` then `mod n` fold makes opcode distribution slightly non-uniform.
   Accept (validity is the contract, not uniformity — MUT-003), or reject-sample opcodes for a
   flat distribution? Propose: accept; note it in tutorial docs.
5. **Cosmic-ray target scope.** Uniform over the whole soup (Tierra, includes dead code/gaps)
   vs. live-cell-only? Propose: whole soup (faithful); the `probOfHit` size scaling already
   accounts for the dilution.
