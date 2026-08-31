# Phase A — Reference-Coverage Audit (original Tierra v6.02 → tierra26 specs)

**Question this answers:** *Did our product/engine specs drop anything that shapes what
evolves in real Tierra?*

**Method.** Every significant element enumerated in `docs/original-tierra/` (PASS1-INVENTORY
+ deep-dives 01–08, 13) was classified against `docs/spec/` (ISA-VM-SPEC, M0-TECH-DESIGN,
and systems 01–15) as:

- **COVERED** — present in a spec, faithfully (cite doc/section).
- **DEFERRED** — intentionally out of scope, with a *conscious* marker in a spec
  (`[OPTIONAL]`/`[MOD]`/reference-only/"deferred to M1"). Verified it is a decision, not an
  oversight.
- **MISSED / UNCLEAR** — a mechanic, parameter, or edge case that shapes dynamics and is
  **neither** covered **nor** consciously deferred, **or** where the spec's choice silently
  diverges from the shipped Tierra default in a way that changes what evolves. These are the
  findings.

Source spot-checks against `reference/tierra-v6.02/tierra/` (`gb0/opcode.map`, `soup_in`/si0,
counts) are cited inline.

Scope note: multicellularity/threads (09), tools/UIs (10), and distributed/cluster/audio (12)
are out of scope for tierra26 and are treated only where a mechanic leaks into the single-node
core.

---

## 1. Summary

| Category | Covered | Deferred (conscious) | Missed / Unclear |
|---|---|---|---|
| A. Virtual CPU / machine model | 9 | 4 | 1 |
| B. Instruction set (32 classic) | 32/32 + mechanics | ext64 + toggles/threads/IO/ploidy/shadow | 0 |
| C. Memory / soup / protection | 6 | 3 | 1 |
| D. Slicer / scheduling | 3 | 3 | **2** |
| E. Reaper / death | 6 | 4 | **1** |
| F. Reproduction / life-cycle | 7 | 4 | 1 |
| G. Genetics / variation operators | 7 | 0 | **1** |
| H. Genebank / genotype | 6 | 3 | 0 |
| I. Disturbance | 0 | 1 | **1** |
| K. RNG / reproducibility | 4 | 1 | 0 |
| Params (soup_in single-machine) | ~40 relevant | ~15 | **7** |
| Ancestor & inoculation | 1 | — | **2** |

**MISSED / UNCLEAR total: 12 distinct items** (see §14, prioritized). None is a silent hole in
a CORE mechanic that is claimed covered; the findings are (a) a small number of default-value
divergences that change selection, (b) one core anti-parasite pressure deferred to M1 whose
deferral is under-justified, and (c) config-schema gaps where the engine can't be tuned to the
mechanic the mutation/slicer systems already implement.

**Headline:** the *mechanisms* are captured with high fidelity — the 32 classic instructions,
template addressing, the write-protection asymmetry (parasite niche), mal→copy→divide with the
0.7 gate, the two-queue slicer/reaper, the flaw/copy/cosmic/divide-time mutation families, and
seed reproducibility are all present and faithful. The gaps are almost entirely about
**default parameter values and their exposure as scenario config** — i.e. *which* Tierran
regime the engine runs, not *whether* it can.

---

## 2. Category A — Virtual CPU / machine model

| Element | Status | Where |
|---|---|---|
| 6 general registers | COVERED (reduced to **4, A–D**) | ISA-VM §2.1, §10 ledger; cpu 07 §3 — classic32 uses only A–D; faithful to `gb0/opcode.map` |
| IP + `ad()` circular wrap | COVERED | cpu 07 §4.2; soup 02 §4.1 |
| Stack depth 10 + SP | COVERED | cpu 07 §3 |
| Flags E/S/Z | COVERED | cpu 07 §4.3–4.5 |
| Flags B (bit-width) / D (direction) | DEFERRED (extended-only) | ISA-VM §2.1 [MOD], §10 |
| Fetch→decode→execute + reused decode struct | COVERED | cpu 07 §4.1; decode 05 |
| Per-opcode cycle cost `cyc` | COVERED (uniform 1) — **faithful**: every classic op has `cyc=1` in `gb0/opcode.map` | cpu 07 §7, open Q4 |
| `flaw()` operand perturbation | COVERED as seam (M1) | cpu 07 §7; mutation 11 §4.2 |
| Multi-CPU per cell / `csync` / `split` / `MaxCpuPerCell` | DEFERRED | ISA-VM §4.10; cpu 07 §7; slicer 09 §7 |
| Shadow registers, RPN, ploidy tracks | DEFERRED | ISA-VM §4.10 |
| **Stack over/underflow → `E` (vs Tierra silent ring)** | **UNCLEAR [MOD]** | cpu 07 §7, ISA-VM §2.1/§11.1 — see §14-5 |

Everything mechanically load-bearing is present. The one open divergence is the stack fault
policy (below).

---

## 3. Category B — Instruction set (the 32 classic ops)

**Verified against `reference/tierra-v6.02/tierra/gb0/opcode.map` (32 lines).** All 32 opcodes,
in load order, match ISA-VM-SPEC §3.3 exactly — mnemonic, exec fn, decode fn, and register
binding:

`nop0 nop1 not0 shl zero ifz subCAB subAAC incA incB decC incC pushA–D popA–D jmpo jmpb call
ret movDC movBA movii adro adrb adrf mal divide` — **32/32 COVERED, semantics faithful.**

Spot-notes confirming fidelity:
- `zero`/`movBA`/`movDC` route through Tierra's `movdd` exec; `subCAB`/`subAAC`/`incX`/`decC`
  through `math`; `ifz` through `ifz`/`skip`; `jmp*`/`adr*`/`mal`/`divide` as in the reference.
  The spec's stated per-op semantics match `docs/original-tierra/02` §4.
- `adro` is present in the 32-set (dropped only in the 64-set) — correctly kept (ISA-VM §3.2).
- `ifz` = "run next iff C==0, else skip one cell" — matches decode 05 §4.3 and the ancestor's
  copy-loop exit. COVERED.
- `divide`'s 3-mode (`create-cpu`/`start-cpu`/`split`) form is collapsed to single-step divide
  — **faithful to the ancestor** (`0080aaa` issues one `divide`); multi-CPU modes DEFERRED
  (repro 08 §7). COVERED.
- Template addressing (complementary `nop` match, outward/fwd/bwd, nearest-wins, tie→fwd,
  landing just-past, wrap, miss⇒E) — COVERED exactly (template 06 §4, §7).
- Two-level dictionary/active-set + mutation-in-low-bits-`mod N` — COVERED (isa 04).

**DEFERRED (conscious, ISA-VM §3.2/§3.4, §4.10):** the entire `extended64` set; register toggles
(`togdr/togsr/toger`, `clrf*`, `De/So/Se` groups); threads (`split/join/csync/halt/slicexit`);
IO (`get/put/puticc`); ploidy (`trso/trde/trex`); shadow (`A/B/C/D`); network (`surf/tpings/…`).

**No MISSED items in the ISA.** This is the strongest-covered category.

---

## 4. Category C — Memory / soup / protection

| Element | Status | Where |
|---|---|---|
| Flat shared soup, 1 byte = 1 cell, `SoupSize=60000` | COVERED | soup 02 §3, §7 |
| Circular `ad()` addressing (both ends) | COVERED | soup 02 §4.1 |
| Three-domain chmod protection → read/exec global, write own+daughter | COVERED (the parasite niche, exact) | soup 02 §4.4–4.5, §7 |
| `MemModeMine=0`,`Free=0`,`Prot=2` defaults | COVERED | soup 02 §4.4 |
| Cartesian free-tree | DEFERRED [MOD] (sorted interval list) | alloc 03 §7 |
| 6 `MalMode` strategies | DEFERRED (hook; **default first-fit**) | alloc 03 §7 — see §14-4 |
| `DeadMemInit` (leave/zero/randomize freed bytes) | DEFERRED [OPTIONAL] (mode 0 = leave = faithful default) | soup 02 §7 |
| Free-soup writes (`MemModeFree=0` permits) | DEFERRED [MOD] (folded to write-denied; argued dynamics-identical) | soup 02 §4.4, §9 |
| Coalescing on free | COVERED (implicit) | alloc 03 §4.4 |
| `MaxMalMult` size cap, `MinCellSize` | COVERED | alloc 03 §3 |

**Missed/Unclear:** the **default placement policy** — first-fit — matches *no* shipped Tierra
scenario (si0 = `MalMode=1` better-fit; header default = 2 random; mode 3 near-mother is what
enables sociality). Deferred-with-a-hook, but the *chosen default* is a dynamics decision (§14-4).

---

## 5. Category D — Slicer / scheduling

| Element | Status | Where |
|---|---|---|
| `RanSlicerQueue` (SliceStyle=2) round-robin + jittered slice | COVERED | slicer 09 §4.1, §7 |
| Slice ∝ genome size (SizDepSlice=1, SlicePow=1) | COVERED **but see §14-1** | slicer 09 §4.1 |
| Newborn enters behind mother (`EntBotSlicer`) | COVERED | slicer 09 §3 |
| `TimeSlice` executes N instr/cell | COVERED | slicer 09 §4.2 |
| `SlicerQueue` (strict RR, style 0) | DEFERRED (trivial special case) | slicer 09 §7 |
| `SlicerPhoton` (style 1, spatial energy) | DEFERRED [OPTIONAL] | slicer 09 §7 |
| Multi-CPU inner loop | DEFERRED | slicer 09 §7 |
| **`SizDepSlice` / `SlicePow` / `SliceSize` as scenario config** | **MISSED** (schema locks `{sizeDependent:true, slicePow:1}`) | api 15 §2 — see §14-1, §14-2 |

**Two Missed/Unclear items here (both HIGH):**
1. **`SizDepSlice` default.** The shipped `gb0/soup_in` file sets `SizDepSlice = 0` (verified),
   i.e. size-**independent** slices (base `SliceSize=25`, uniform `[0,50]`), which strongly
   selects for **small** genomes. The spec (following reference doc 04's "canonical" claim)
   locks `SizDepSlice=1, SlicePow=1` — the size-**neutral** regime. These produce materially
   different size evolution. Even the reference study is internally inconsistent (doc 06 reports
   the file value `0`; doc 04 quotes the header value `1`). Needs reconciliation. (§14-1)
2. **`SlicePow` is *the* size-bias knob** (`<1` favours small, `>1` large — 13-evolutionary
   §Optimization), yet it is hard-wired to `1` in `Scenario.slicer` with no override. A tutorial
   that wants to demonstrate size selection cannot. (§14-2)

---

## 6. Category E — Reaper / death

| Element | Status | Where |
|---|---|---|
| Linear reaper queue, bottom-entry/top-exit | COVERED | reaper 10 §3, §4a |
| Error moves up / reproduction moves down | COVERED | reaper 10 §4b–4c |
| `kill` frees mother + undivided daughter, both queues | COVERED | reaper 10 §4d |
| Reap-to-make-room (retry-until-space) | COVERED | reaper 10 §4e; alloc 03 §4.2 |
| Reap-on-fullness threshold | COVERED | reaper 10 §4f |
| `ReapRndProp` random-top-N victim | DEFERRED [MOD] toggle (off in M0; **si0 sets `.3`**) | reaper 10 §7 |
| `MalReapTol` localized reaping | DEFERRED [OPTIONAL] | reaper 10 §7 |
| Random ejection `EjectRate` | DEFERRED [OPTIONAL] (si0=0) | reaper 10 §7 |
| Termination codes (LAZY/DISTURB/HALT/SOUP_FULL/…) | DEFERRED (single death event) | reaper 10 §7 |
| Vestigial fecundity queue | COVERED (correctly not implemented) | reaper 10 §7 |
| `UpRprIf`/`DownReperIf` conditional (`>=`/`<=` neighbour) | COVERED as [MOD] unconditional | reaper 10 §7, open Q1 |
| **Lazy reaping (`LazyTol` vs `RepInst`)** | **DEFERRED to M1 — but under-justified** | reaper 10 §7; slicer 09 §7 — see §14-3 |

**Missed/Unclear:** lazy reaping is *labelled* deferred, so it is technically a conscious
decision — but the reference (04 §1e) calls it "the main pressure against parasites/junk that
consume CPU but never reproduce," and parasites are the project's headline phenomenon. Deferring
the anti-lazy pressure past the first evolving milestone risks a distorted ecology
(parasites/junk not culled). Flagged as a deferral that needs an explicit dynamics justification
or an earlier milestone. (§14-3)

Note also `ReapRndProp` default: si0 ships `.3` (stochastic top-30% victim), the spec ships `0`
(deterministic top). Determinism is deliberate for M0 golden runs, but a faithful evolving run
should expose it. Tracked under params (§14-7).

---

## 6b. Category F — Reproduction / life-cycle

| Element | Status | Where |
|---|---|---|
| mal → copy loop → divide, three phases | COVERED | repro 08 §4 |
| `MovPropThrDiv=0.7` divide gate (integer eval) | COVERED | repro 08 §4.3, §6 |
| Daughter write-protected to mother | COVERED | repro 08 §4.1 |
| `mal` frees prior undivided daughter | COVERED | repro 08 §4.1 |
| Divide moves mother down / error up | COVERED | repro 08 §4.3 |
| Daughter: fresh CPU, own IP, both queues | COVERED | repro 08 §4.3 |
| Fill = distinct-byte bitmask (vs `mov_daught` + `MovOff*` span) | COVERED [MOD] | repro 08 §3 |
| `MinGenMemSiz` + span guard | DEFERRED [OPTIONAL] (subsumed by bitmask) | repro 08 §7 |
| `MaxCpuPerCell`, 3-mode divide | DEFERRED [OPTIONAL] | repro 08 §7 |
| `DivSameSiz`/`DivSameGen` | DEFERRED [OPTIONAL] (off in si0) | repro 08 §7 |
| `EjectRate` daughter ejection | DEFERRED [OPTIONAL] (si0=0) | repro 08 §7 |
| `MateSizeEp` (mate-size window) | COVERED-by-reference in mutation 11 (`mateSizeEp`, croSamSiz) | mutation 11 §4.5 |

**Missed/Unclear (minor):** the `MovOffMin/MovOffMax` **span** requirement is dropped in favour
of a distinct-byte count. Argued tighter/equivalent, and it is; but for pathological mutants
(scattered writes) the two measures differ. Low risk, flagged for completeness (§14-9).

---

## 7. Category G — Genetics / variation operators

| Operator | Status | Where |
|---|---|---|
| Background/cosmic mutation (`mutate`/`mut_site`) | COVERED (seam M1) | mutation 11 §4.4 |
| Flaw ±1 (`flaw()`) | COVERED (seam M1) | mutation 11 §4.2 |
| Copy/move mutation (`GenPerMovMut`) | COVERED (seam M1) | mutation 11 §4.3 |
| Divide mutation (`GenPerDivMut`) | COVERED | mutation 11 §4.5 (`divMut`) |
| Insertion/deletion/crossover (instruction) | COVERED | mutation 11 §4.5 |
| Insertion/deletion/crossover (segment) | COVERED | mutation 11 §4.5 |
| Same-size crossover (`CroInsSamSiz`) | COVERED | mutation 11 §4.5 |
| `MutBitProp` bit-flip vs replace split | COVERED (`mutBitPropPct`) | mutation 11 §4.3 |
| `GenPer*`→period rescale (`CalcFlawRates`) vs raw-modulus divide-time | COVERED [MOD] integer | mutation 11 §4.1 |

The mutation *system* (11) is the most complete transcription in the spec set — every operator
and rate family is present with faithful firing semantics, correctly distinguishing the
continuous-channel period model from the divide-time raw-modulus model.

**Missed/Unclear:** the **Engine `Scenario.mutation` schema (api 15 §2) only exposes
`{flaw, copy, cosmic}`** — it omits `divMut`, `insInst/delInst/croInst`, the three segment
operators, `croSamSiz`, and `mutBitPropPct` that the mutation system (11) defines in
`MutationRates`. So the divide-time recombination/indel operators — the ones that let genome
**size and structure** evolve (reference 05 §"Requirement") — cannot be turned on through the
public API as specified. Schema/interface mismatch between 11 and 15. (§14-6)

---

## 8. Category H — Genebank / genotype

| Element | Status | Where |
|---|---|---|
| Genotype = byte-exact equivalence class | COVERED | genebank 12 §1, §4.1 |
| `size+label` naming (`0080aaa`, `Int2Lbl` base-26) | COVERED (exact) | genebank 12 §4.3, §7 |
| Birth-order deterministic labels (vs Tierra slot reuse) | COVERED [MOD] | genebank 12 §7, open Q1 |
| Demographics alive/everBorn; birth/death hooks | COVERED | genebank 12 §4.2, §4.4 |
| Lineage (parent, firstSeen, sample bytes) | COVERED | genebank 12 §4.2 |
| Size-class lists (`SList`) | COVERED (`bySize`) | genebank 12 §3 |
| Hash `(3h+inst)%prime` → FNV-1a | DEFERRED [MOD] (byte-compare identity preserved) | genebank 12 §7 |
| Save policy (`SavMinNum`/`SavThrPop`/`SavThrMem`/`CumGeneBnk`) | COVERED (shape preserved) | genebank 12 §4.5 |
| On-disk XDR archive, `SaveFreq`/`SavRenewMem`/`TierraLog` | DEFERRED [OPTIONAL] (in-memory bank) | genebank 12 §7 |
| `AvgRpdEff`/`MaxProp*` (not selection inputs) | DEFERRED [OPTIONAL] → stats 13 | genebank 12 §7 |

Fully covered for the observation/speciation role. No missed dynamics.

---

## 9. Category I — Disturbance

| Element | Status | Where |
|---|---|---|
| Periodic mass extinction `DistFreq`/`DistProp`/`DistNext` | DEFERRED [OPTIONAL] | reaper 10 §7 |
| Scenario config for disturbance | **MISSED** (not in `Scenario` schema) | api 15 §2 — see §14-8 |

Disturbance is off in si0 (`DistFreq=-.3`) so deferring the *mechanism* for M0 is defensible.
But it is **on** in si3/si7 (`DistFreq=10`), and the reference (13-evolutionary §Diversity) ties
it to diversity maintenance and punctuated-equilibrium succession — a core "what evolves" story.
It is deferred with a marker (conscious) **but** the `Scenario` schema has no slot for it, so
enabling it later means a schema change, not a config flip. Flagged (§14-8).

---

## 10. Category K — RNG / reproducibility

| Element | Status | Where |
|---|---|---|
| Single seeded PRNG, all events draw from it, fixed order | COVERED (exact in spirit) | rng 01 §7 |
| `ran1` 3-stream `double` generator | DEFERRED [MOD] → xoshiro128** integer-only | rng 01 §4.1, §7 |
| `seed==0` = wall-clock | COVERED as deliberate divergence (seed 0 = normal, reproducible) | rng 01 §4.5, §7 |
| `tlrand()%N` modulo bias | COVERED [MOD] (unbiased rejection sampling) | rng 01 §4.3, §7 |
| Snapshot of RNG state | COVERED | rng 01 §5; snapshot 14 |

Consequence worth stating (not a gap): because the bit-generator is swapped, tierra26 runs are
**not** bit-identical to Ray's original runs — only internally reproducible. This is an explicit,
correct product decision (own reproducibility over cross-implementation replay).

---

## 11. soup_in parameters — single-machine relevance map

Of the ~155 `soup_in` parameters, the ones that affect single-node dynamics and their status:

**Represented in Scenario/config or a system spec:** `SoupSize`, `seed`, `MinCellSize`,
`MovPropThrDiv`, `SearchLimit`, `MinTemplSize`, `MaxMalMult`, `MemModeMine/Free/Prot`,
`SliceStyle`(=ran), `GenPerFlaw/BkgMut/MovMut/DivMut` + indel/crossover family, `MutBitProp`,
`MateSizeEp`, reaper threshold, `MaxCellSize`. — COVERED (some as M1 seams).

**Consciously DEFERRED** (experiment switches / off in si0 / host-only): `DivSameSiz`,
`DivSameGen`, `MalSamSiz`, `EjectRate`, `SlicerPhoton`+`Photon*`, `AbsSearchLimit`, `PutLimit`,
`DeadMemInit`, `SaveFreq`/`SavRenewMem`/`DiskBank`/`DiskOut`/`Watch*`/`TierraLog`,
`CpuLoadLimit*`/`TierraNice`/`TierraSleep`/`MinSpeed`/`SpeedUpdate`, all NET/UDP/TCP rows,
thread-analysis rows, `MaxCpuPerCell`, IO buffer sizes, `MaxSigBufSiz`, `StrictIP`, ploidy
(`JmpSouTra`/`JumpTrackProb`).

**MISSED / UNCLEAR (dynamics-affecting, neither cleanly covered nor consciously placed):**

| Param | Effect on what evolves | Status |
|---|---|---|
| `SizDepSlice` (si0=0) | size-neutral vs pro-small selection | UNCLEAR — spec locks 1 (§14-1) |
| `SlicePow` (=1) | size-bias knob (`<1` small, `>1` large) | MISSED as config (§14-2) |
| `SliceSize` (25) | base CPU quantum when size-independent | MISSED as config (tied to §14-1) |
| `LazyTol` (si0=10) | anti-parasite / anti-junk CPU pressure | DEFERRED-under-justified (§14-3) |
| `MalMode` (si0=1) | spatial placement → parasitism/sociality onset | default-diverges (§14-4) |
| `ReapRndProp` (si0=.3) | stochastic vs deterministic death | MISSED as config (§14-7) |
| `DistFreq`/`DistProp` | diversity / punctuated succession | MISSED as config (§14-8) |
| `DropDead` (si0=5) | run-abort watchdog on reproductive collapse | MISSED (§14-10, minor) |

---

## 12. Ancestor & inoculation

| Element | Status | Where |
|---|---|---|
| `0080aaa` self-replication *algorithm* | COVERED (described, used in REPRO-018 breed-true) | ISA-VM §6; repro 08 §4.4 |
| `0080aaa` genome as **classic32 opcode data / scenario artifact** | **UNCLEAR** — referenced, not materialized in any spec | — see §14-11 |
| Initial inoculation layout (`center` / `space N` gap, `NumCells`) | **MISSED** — inject is plain first-fit; no initial-placement directive | api 15 §4.2 — see §14-12 |
| `.tie`/`.gdf`/`.gen`/`soup_out`/`core_out` formats | DEFERRED [OPTIONAL] (snapshot replaces core_out; Scenario replaces soup_in) | api 15 §7; snapshot 14 |

---

## 13. Notable [MOD] divergences that change *behavior* (not just implementation)

These are consciously flagged in the specs but each alters observable dynamics; listed so a
reviewer can confirm each is intended:

1. **Stack over/underflow raises `E`** instead of Tierra's silent ring (cpu 07 §7). An evolved
   genome that relied on stale-pop or push-wrap behaves differently. (Open item; §14-5.)
2. **Free-soup writes denied** vs Tierra `MemModeFree=0` permits (soup 02 §4.4). Argued
   equivalent; verify no scenario writes free space pre-allocation.
3. **First-fit default `MalMode`** vs Tierra's random/better-fit/near-mother (§14-4).
4. **Distinct-byte fill count** vs `mov_daught`+span (repro 08 §3; §14-9).
5. **xoshiro128\*\* + unbiased `int`** vs `ran1`+modulo (rng 01 §7) — different random stream.
6. **`ttime` returns cycle count** vs wall-clock (ISA-VM §4.2) — determinism; classic ancestor
   doesn't use `ttime`, so no practical effect on the classic story.

---

## 14. Prioritized MISSED / UNCLEAR findings (most dynamics-affecting first)

### HIGH

**A-1. `SizDepSlice` regime is locked to size-neutral; shipped `gb0` default is size-independent.**
*What:* `reference/.../soup_in` (=si0) sets `SizDepSlice = 0`, `SliceSize = 25` (uniform slice
`[0,50]` regardless of genome size). The spec (slicer 09 §4.1, api 15 §2) hard-codes
`SizDepSlice=1, SlicePow=1` (slice ∝ size ⇒ size-neutral fitness). The reverse-eng study is
itself split (doc 06 reports `0`, doc 04 asserts `1` as "canonical").
*Why it matters:* this is the single knob that decides whether **size is under selection**.
`=0` strongly selects for small genomes (the famous shrink-to-`0022aaa` story is partly a CPU-
economy effect, not only flaw-driven); `=1` removes that pressure and leaves shrinkage to
mutation efficiency alone. Choosing wrong changes the central optimization narrative.
*Absorb into:* reconcile in `docs/original-tierra/04` and `06`; then make
`slicer.{sizeDependent, slicePow, sliceSize}` **configurable** in `Scenario` (api 15 §2) with a
documented default, and pick the default deliberately (recommend matching the canonical
size-neutral papers **and** shipping a size-selection scenario). Update slicer 09 §4.1.

**A-2. `SlicePow` (and `SliceSize`) not exposed as scenario config.**
*What:* `Scenario.slicer` fixes `slicePow:1` and has no `sliceSize`.
*Why:* `SlicePow` is *the* documented size-bias control (13-evolutionary §Optimization; §"Why
key params matter"). Tutorials and Versus scenarios need it to show/tune size selection.
*Absorb into:* api 15 §2 `Scenario.slicer`; wire through slicer 09 §4.1 (already computes
`base = pow(size, SlicePow)` conceptually).

**A-3. Lazy reaping (`LazyTol`) deferred to M1 with weak justification.**
*What:* reaper 10 §7 / slicer 09 §7 defer `LazyTol` vs `RepInst` lazy-reap to M1.
*Why:* reference 04 §1e names it "the main pressure against parasites/junk that consume CPU but
never reproduce." Parasitism is the project's flagship emergent phenomenon; without lazy-reaping
the first evolving runs may accumulate non-reproducing junk and mis-portray the ecology.
*Absorb into:* reaper 10 — either add lazy-reaping to the first evolving milestone (M1)
explicitly alongside mutation, or document why the disturbance/soup-full death alone suffices.

**A-4. Default `MalMode` = first-fit diverges from every shipped Tierra scenario and suppresses
spatial structure.**
*What:* alloc 03 defaults to deterministic first-fit; si0 uses `MalMode=1` (better-fit), header
`2` (random), and `3` (near-mother) is what produces the **aggregation** required for social
hyper-parasites and obligate sociality (13-evolutionary §Symbiosis/§"Why params matter").
*Why:* *where* daughters land governs how often creatures neighbour each other — the
precondition for parasitism/sociality. First-fit packs deterministically and differs from all
three Tierra regimes.
*Absorb into:* alloc 03 — keep the `MalStrategy` hook but (a) implement the reference default
(random or near-mother) for M1 evolving runs, and (b) expose `MalMode` in `Scenario`; note the
first-fit default is an M0-determinism choice, not a fidelity target.

### MEDIUM

**A-5. Stack over/underflow policy (`E` vs silent ring) — confirm before it freezes into golden
runs.** (cpu 07 §7, ISA-VM §11.1) Behavioural divergence for evolved genomes; the spec itself
flags it open. Decide and record; if faithfulness is wanted, keep the silent ring (depth-10)
and drop the `E`.

**A-6. `Scenario.mutation` schema omits the divide-time operator rates the mutation system
implements.** (api 15 §2 vs mutation 11 §2) `Scenario.mutation` is `{flaw, copy, cosmic}` only;
`divMut`, `insInst/delInst/croInst`, `insSeg/delSeg/croSeg`, `croSamSiz`, `mutBitPropPct` are
unreachable through the public API. These are the operators that evolve genome **size/structure**
(reference 05 §"Requirement"). *Absorb into:* widen `Scenario.mutation` in api 15 to the full
`MutationRates` shape from mutation 11.

**A-7. `ReapRndProp` (stochastic victim selection) not exposed.** si0 ships `.3`; spec ships
deterministic top-pick (correct for M0). A faithful evolving run needs the stochastic option.
*Absorb into:* `Scenario.reaper` (api 15) + reaper 10 §7 toggle (already sketched as [MOD]).

**A-8. Disturbance has no `Scenario` slot.** Deferred mechanism is fine for M0, but si3/si7 use
it and it drives diversity/punctuated succession (13). *Absorb into:* add `Scenario.disturbance
{ freq, prop }` (even if unimplemented in M0) so enabling it is a config change, not a schema
change; reaper 10 §7 to own the mechanism at M1.

**A-11. The canonical ancestor genome `0080aaa` is not materialized as classic32 opcode data.**
The specs describe its algorithm and rely on it (REPRO-018 breed-true, GENE-006 single genotype)
but no spec carries the actual 80-byte opcode sequence or a `Scenario` that injects it. Without
it the golden breed-true test has no subject. *Absorb into:* a scenario/fixture doc (or api 15
example) encoding `0080aaa` against the classic32 opcode order, transcribed from
`reference/.../gb0/0080aaa.tie`.

### LOW

**A-9. Divide fill uses distinct-byte count, dropping Tierra's written-**span** guard
(`MovOffMin/Max`).** Equivalent for well-formed copiers; differs for scattered-write mutants.
Note in repro 08 §7 as an accepted, tested divergence.

**A-10. `DropDead` reproductive-collapse watchdog is absent.** si0=5 (abort if no division in 5M
instructions). Not a per-cell dynamic, but it changes whether a run continues after collapse
(relevant once mutation is on and rates can be set too high — 13 §Sterility). *Absorb into:* a
`Scenario.limits.dropDead` + a check in the world tick loop (M1).

**A-12. Initial inoculation layout (`center`/`space N` gap, `NumCells` cycling) not modelled.**
`inject` is plain first-fit; Tierra deliberately spaces the initial ancestor(s) (a half-soup gap
for `center`). Early spatial layout affects the first generations' neighbour structure.
*Absorb into:* api 15 §4.2 — allow an injection to specify a start address / initial gap, or a
scenario `inoculation` directive.

---

## 15. What is solidly covered (assurance)

For confidence, these CORE dynamics-shaping mechanics are present **and faithful**, not just
named: the 32 classic instructions and their bindings (verified byte-for-byte against
`gb0/opcode.map`); complementary template addressing with wrap/miss/limit; the write-protection
asymmetry that *is* the parasite niche; `mal→copy→divide` with the integer 0.7 gate;
reap-to-make-room and the error-up/reproduction-down reaper ordering; the four mutation families
(flaw, copy, cosmic, divide-time indels/crossover at instruction and segment granularity) with
correct period-vs-raw-modulus firing; genotype identity + `Int2Lbl` naming; and single-stream
seeded reproducibility. The gaps above are about *default regime selection and its
configurability*, plus one core pressure (lazy-reaping) whose M1 deferral should be justified —
not about missing mechanisms.
