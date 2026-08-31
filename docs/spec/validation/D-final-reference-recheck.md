# Phase D (Part 1) — Fresh Second Reference Pass & Recheck

**Question this answers:** *After Phases A/B/C, if we return to the original-Tierra reference one
more time — reading the vendored SOURCE as ground truth, not our study docs — did Phase A get
every reference element? Do its 12 findings hold up? Is anything still missed? And can we
actually materialize the ancestor `0080aaa` as classic-32 opcode data?*

**Method.** Independent re-derivation from **both** layers, source treated as authoritative when
the study docs and source disagree:
- Ground truth: `reference/tierra-v6.02/tierra/` — `soup_in`, `soup_in.h`, `si0`/`si1`/`si2`/`si3`/`si7`,
  `gb0/opcode.map`, `gb0/0080aaa.tie`, `instruct.c`, `slicers.c`, `memalloc.c`, `bookeep.c`,
  `tierra.h`, `tierra.c`.
- Our study: `docs/original-tierra/` (PASS1-INVENTORY + 01/04/05/06/07/13).
- Our specs: `docs/spec/engine/ISA-VM-SPEC.md`, `.../M0-TECH-DESIGN.md`, `.../systems/00–15`.

**Verdict up front.** All **12 of Phase A's MISSED/UNCLEAR findings are CONFIRMED** with direct
source evidence — none is overturned; **three are sharpened and made stronger** by a structural
fact Phase A only half-saw (§2, the *header-vs-file two-tier default*). Two genuinely **new**
reference elements surfaced (§3): the lazy-reap **snapshot-state** consequence, and the fact that
the spec's slicer regime **matches no shipped scenario, only the C header**. The ancestor
`0080aaa` is **fully materializable** from `gb0/0080aaa.tie` — its exact 80-byte classic-32
sequence and gene map are transcribed in §4.

---

## 1. A-finding-by-A-finding confirmation

Legend: **CONFIRM** = Phase A right, source agrees. **CONFIRM+** = right, and source makes it
*stronger/more precise* than Phase A stated. No finding was overturned.

| A-# | Phase A claim | Verdict | Source evidence |
|---|---|---|---|
| **A-1** | Spec locks `SizDepSlice=1` (size-neutral); shipped `gb0` default is `0` (size-independent, pro-small). Study split (doc 06=0, doc 04=1). | **CONFIRM+** | `soup_in`==`si0` byte-identical, line 80 `SizDepSlice = 0`, line 82 `SliceSize = 25`. **Every** shipped scenario `si0/si1/si2/si3/si7` = `0`. `slicers.c:184–201` (RanSlicerQueue): with `SizDepSlice=0`, `size_slice=SliceSize=25`, then `SlicFixFrac*25 + tlrand()%(SlicRanFrac*25+1)` = uniform **[0,50]**, genome-size-independent. Spec `09 §4.1` (lines 109–121) hard-models `base=c.size` under `SizDepSlice=1`, citing study doc 04. **Sharpened by §2 below:** `soup_in.h:107` header default *is* `1`; the spec followed the *header*, but the header regime was overridden to `0` in every run Ray shipped. |
| **A-2** | `SlicePow`/`SliceSize` not exposed as scenario config; `slicePow` hard-wired to 1. | **CONFIRM** | `15 §2` schema (lines 71–75): `slicer:{style:'ran'; sizeDependent:true; slicePow:1}` — literal types, **no `sliceSize`**, no way to set `<1`/`>1`. `soup_in.h:108,111` confirm `SlicePow`,`SliceSize` are first-class knobs. |
| **A-3** | Lazy reaping (`LazyTol` vs `RepInst`) deferred to M1, under-justified; it is the main anti-parasite/anti-junk pressure. | **CONFIRM+** | Mechanism located: `slicers.c:158–159` & `205–206` — **in the core slice loop**: `while (InstExe.m && NumCells>NumCellsMin && LazyTol && ce->d.repinst > RepInst*LazyTol) ReapCell(ce, REAP_LAZY)`. On in **all** shipped scenarios (`LazyTol=10`) *and* the header (`=5`). `tierra.h:71` `REAP_LAZY 1`. Not an optional extra — a per-slice selection pressure. **New consequence in §3-N2.** |
| **A-4** | Default `MalMode` first-fit diverges from every shipped scenario; suppresses spatial structure. | **CONFIRM+** | `alloc 03`/schema default first-fit (case 0). Shipped file `MalMode=1` (better-fit, all si*), header `MalMode=2` (random) `soup_in.h:78`. `memalloc.c:276,310,351` implement 0=first-fit,1=better-fit,default=better-fit. **Spec matches neither the header nor any shipped run.** |
| **A-5** | Stack over/underflow raises `E` in spec vs Tierra's silent ring. | **CONFIRM** | `instruct.c:1503` push: `sp = ++sp % STACK_SIZE` — silent wrap, **no E**; `1526/1559` pop: at `sp==0` → `sp = STACK_SIZE-1` (wrap), no underflow E. (Push *does* clear E/S/Z, `:1505`.) The ring is real; spec's `E` is a behavioral divergence for evolved genomes. |
| **A-6** | `Scenario.mutation` = `{flaw,copy,cosmic}` only; omits divMut/indel/crossover the mutation system implements. | **CONFIRM** | `15 §2` line 87 `mutation:{flaw,copy,cosmic}`. `soup_in` lines 38–45 ship the full family (`GenPerDivMut`, `GenPerInsIns/DelIns/CroIns`, `GenPerInsSeg/DelSeg/CroSeg`, `GenPerCroInsSamSiz`) — the operators that evolve genome size/structure — all unreachable through the API type. |
| **A-7** | `ReapRndProp` (stochastic victim) not exposed; si0 ships `.3`, spec deterministic. | **CONFIRM** | `soup_in:77` `ReapRndProp=.3` (all si*); header `0.0` (`soup_in.h:103`). `tierra.c:891` `reap_range=(I32s)(ReapRndProp*NumCells)` — random victim within the top fraction. Not in `Scenario.reaper` (only `threshold`). |
| **A-8** | Disturbance has no `Scenario` slot; on in si3/si7. | **CONFIRM+** | `si0/si1/si2` `DistFreq=-.3` (off); `si3/si7` `DistFreq=10` (**on**, verified). Header `DistFreq=+.3` (`soup_in.h:55`, i.e. *on* by compile default). `15 §2` Scenario has no disturbance field. |
| **A-9** | Divide fill uses distinct-byte count, dropping the written-span guard. | **CONFIRM** | `instruct.c:2064` `Thresh=(I32s)(ce->md.s*MovPropThrDiv*PLOIDY)`; `:2066` divide fails if `mov_daught<Thresh` (integer 0.7 gate — matches repro spec). Tierra tracks `mov_daught` as a *count*; the spec's distinct-byte bitmask is the accepted [MOD]. Low-risk divergence stands. |
| **A-10** | `DropDead` reproductive-collapse watchdog absent. | **CONFIRM** | `soup_in:33` `DropDead=5` (all si*, header `=5`). No `Scenario.limits.dropDead`; no watchdog in the tick loop. |
| **A-11** | Canonical ancestor `0080aaa` not materialized as classic-32 opcode data; breed-true golden test has no subject. | **CONFIRM** (materializable — see §4) | Specs describe the *algorithm* (`ISA-VM §6`, repro `08 §4.4`) and cite study doc 07, but **no spec carries the 80-byte sequence or an injecting Scenario**. It *is* fully recoverable from `gb0/0080aaa.tie` (§4). Minor correction to task premise: **no `0080aaa.gdf` exists** in `gb0/` (only `.tie`); the gene-descriptor header lives inline atop the `.tie`. |
| **A-12** | Initial inoculation layout (`center`/`space`, `NumCells`) not modelled; inject is plain first-fit. | **CONFIRM** | `soup_in` tail (lines 72,89–90): `NumCells=2`, directive `center`, genotype `0080aaa`. `15 §2` `Injection={atCycle,genome}` — no start address / gap / placement. `center` deliberately seeds the ancestor at the soup midpoint (a large initial gap), shaping first-generation neighbour structure. |

**Score: 12/12 confirmed (4 as CONFIRM+, 0 overturned).**

---

## 2. The structural fact that sharpens A-1/A-4/A-7/A-8 — a **two-tier default**

Phase A treated `si0` as "the shipped default" and noted the study's internal `0`-vs-`1` split,
but did not name *why* the split exists. The source has **two distinct default layers**, and
they disagree for exactly the dynamics-critical knobs:

| Param | `soup_in.h` (C compile-time default) | Shipped file `soup_in`==`si0` (and si1/2/3/7) | Spec choice | Matches |
|---|---|---|---|---|
| `SizDepSlice` | **1** (`:107`) | **0** (all si*) | `1` | header only — **no run ever executed with it** |
| `SlicePow` | 1 | 1 | 1 (fixed) | both |
| `SliceSize` | 25 | 25 | *(absent)* | — |
| `MalMode` | **2** random (`:78`) | **1** better-fit | **0** first-fit | **neither** |
| `LazyTol` | 5 (`:77`) | 10 | *(deferred, effectively 0)* | neither (both non-zero) |
| `ReapRndProp` | 0.0 (`:103`) | .3 | 0 (deterministic) | header only |
| `DistFreq` | +.3 *on* (`:55`) | −.3 *off* (si0/1/2), +10 *on* (si3/7) | *(absent)* | — |

**Consequence (the load-bearing point).** The spec's slicer regime (`SizDepSlice=1`, size-neutral)
is the **compile-time header** default that **every shipped `soup_in` overrides to `0`**. So the
central "is size under selection?" decision was made by following a default that Ray's own runs
never used. This is not a study-doc typo to reconcile — it is a real fork in the source, and the
faithful-to-experiments branch is `0` (pro-small, uniform slice [0,50]). Whichever tierra26 picks,
it must be a **deliberate, documented** choice, and both regimes should be shippable (A-1/A-2). The
same header-vs-file gap explains `MalMode` (A-4), `ReapRndProp` (A-7), and `DistFreq` (A-8): the
spec silently inherited *header* defaults for a system whose *experiments* used different values.

---

## 3. NEW reference elements (beyond Phase A's 12)

**N-1 — The spec's slicer default is faithful to the header, not to any experiment.** (Covered in
§2.) This is the single most important new observation: it re-frames A-1 from "a value to
reconcile between two study docs" into "a value to choose between two *source* layers, where the
experiment layer says `0`." Elevate accordingly.

**N-2 — Lazy reaping introduces new *reproducible-snapshot state* → ties A-3 to the Phase C
snapshot cluster.** The lazy-reap predicate (`slicers.c:158`) reads **per-creature `ce->d.repinst`**
(instructions since last reproduction, reset on divide) and the **global `RepInst`** (avg
instructions per replication, recomputed in `bookeep.c:558/1244` from `AvgPop`/reproduction
counts, `CalcFlawRates`). Two implications the specs don't yet connect:
- If A-3 is honoured (lazy-reap at M1), the snapshot must carry `repinst` per creature **and** the
  running `RepInst`/`AvgPop`/`AverageSize` aggregates — otherwise restore mis-times the next lazy
  reap. This *extends* Phase C's SNAP-012..015 completeness holes with a new required field set.
- `bookeep.c:1254` `RateFlaw = RepInst*GenPerFlaw*2` — **mutation firing periods are derived from
  the same live `RepInst`.** So `RepInst`/`AverageSize` are *already* snapshot-critical (they gate
  mutation cadence, matching Phase C SNAP-015's `avgSize` point) even before lazy-reap. Confirms and
  broadens SNAP-015: the reproducible-state surface includes the population running-stat aggregates,
  not just `births/deaths`.

**N-3 — Reaper termination-reason codes are enumerable** (`tierra.h:71–80`: `REAP_LAZY=1`,
`REAP_DISTURB=2`, `REAP_HALT=3`, `REAP_NON_NET_EJECT=4`, `REAP_SOUP_FULL=5`, `REAP_APOCALYPSE=101`).
Confirms reaper `10 §7`'s "termination codes deferred (single death event)" is a *conscious* fold;
no action beyond noting that if Versus/analytics ever want cause-of-death, the taxonomy is small and
fixed. Minor.

**N-4 — (Non-gap, recorded to prevent churn.)** `SlicFixFrac`/`SlicRanFrac` are **not** missing:
the spec's slicer `09 §4.1` (line 114) bakes them in as `0`/`2` (jitter = uniform `[0, 2·base]`,
mean = base). This is faithful; do **not** open a finding for them. The only slicer gap is the
`base` term (size vs constant) and its configurability (A-1/A-2).

**No other reference mechanic, default, or edge case was found missing.** The 32-op set matches
`gb0/opcode.map` line-for-line (re-verified against `ISA-VM §3.3`); template addressing, the
write-protection asymmetry, `mal→copy→divide` with the integer 0.7 gate, the four mutation
families, genotype identity/naming, and single-stream RNG reproducibility are all present and
faithful (as Phase A and B concluded).

---

## 4. Ancestor materialization — `0080aaa` **is** fully recoverable

**Path:** `reference/tierra-v6.02/tierra/gb0/0080aaa.tie` (there is **no** `.gdf` for it in `gb0`;
the gene descriptor is the header block atop the `.tie`).

**What the file gives us, directly:**
- **Header / gene map** (lines 1–9): `genotype: 0080aaa  genetic: 0,80  parent: 0666god`;
  `mov_daught: 80  breed_true: 1` for both daughters; `inst: 827`/`809` (instructions to first/second
  divide). This is the golden breed-true oracle: an unmutated `0080aaa` copies 80 bytes and breeds
  true.
- **Body** (lines 13–95): 80 lines, one per byte, each carrying **mnemonic + hex opcode + index +
  annotation**. The hex column *is* the classic-32 opcode (verified: it equals the 0-based index in
  `gb0/opcode.map`, e.g. `movDC=0x18=24`, `adrb=0x1c=28`, `mal=0x1e=30`, `divide=0x1f=31`).

**The exact 80-byte classic-32 opcode sequence** (index → hex → mnemonic), transcribed and
cross-checked against `gb0/opcode.map`:

```
 0: 01 nop1   1: 01 nop1   2: 01 nop1   3: 01 nop1   4: 04 zero   5: 02 not0
 6: 03 shl    7: 03 shl    8: 18 movDC  9: 1c adrb  10: 00 nop0  11: 00 nop0
12: 00 nop0  13: 00 nop0  14: 07 subAAC 15: 19 movBA 16: 1d adrf  17: 00 nop0
18: 00 nop0  19: 00 nop0  20: 01 nop1  21: 08 incA  22: 06 subCAB 23: 01 nop1
24: 01 nop1  25: 00 nop0  26: 01 nop1  27: 1e mal   28: 16 call  29: 00 nop0
30: 00 nop0  31: 01 nop1  32: 01 nop1  33: 1f divide 34: 14 jmpo 35: 00 nop0
36: 00 nop0  37: 01 nop1  38: 00 nop0  39: 05 ifz   40: 01 nop1  41: 01 nop1
42: 00 nop0  43: 00 nop0  44: 0c pushA 45: 0d pushB 46: 0e pushC 47: 01 nop1
48: 00 nop0  49: 01 nop1  50: 00 nop0  51: 1a movii 52: 0a decC  53: 05 ifz
54: 14 jmpo  55: 00 nop0  56: 01 nop1  57: 00 nop0  58: 00 nop0  59: 08 incA
60: 09 incB  61: 14 jmpo  62: 00 nop0  63: 01 nop1  64: 00 nop0  65: 01 nop1
66: 05 ifz   67: 01 nop1  68: 00 nop0  69: 01 nop1  70: 01 nop1  71: 12 popC
72: 11 popB  73: 10 popA  74: 17 ret   75: 01 nop1  76: 01 nop1  77: 01 nop1
78: 00 nop0  79: 05 ifz
```

**Gene structure (template map, from the annotations):**
- **0–3** `nop1×4` — beginning marker (self-locate target for `adrb`).
- **4–8** set up size: `zero,not0,shl,shl,movDC` → build the constant, stash in D.
- **9–15** locate mother start: `adrb` + complement `nop0×4`, `subAAC`, `movBA` (start addr → B).
- **16–22** locate end / compute size: `adrf` + `nop0,nop0,nop0,nop1`, `incA`, `subCAB` (size → C).
- **23–34** reproduction loop: marker `nop1,nop1,nop0,nop1`; `mal` (alloc C → A); `call` copy proc
  (complement `nop0,nop0,nop1,nop1`); `divide`; `jmpo` back to loop marker (`nop0,nop0,nop1,nop0`).
- **39/66/79** `ifz` dummies — template separators.
- **40–74** copy procedure: templates `nop1nop1nop0nop0` / `nop1nop0nop1nop0`; `pushA/B/C`; the
  copy loop `movii,decC,ifz,jmpo`; `incA,incB,jmpo`; exit `popC,popB,popA,ret`.
- **75–79** `nop1,nop1,nop1,nop0` end marker (target for `adrf`), `ifz` separator.

**What's needed to turn this into a fixture (the A-11 fix, concrete):**
1. Emit the 80-byte array above as an engine fixture / `Scenario` example (e.g. `injections:[{atCycle:0,
   genome:<these 80 bytes>}]`, `instructionSet:'classic32'`, `mutation:{0,0,0}`, `seed:<pinned>`).
2. Author the **breed-true golden** (`INT-ANCESTOR-GOLDEN`, Phase C §3): run sterile; assert the
   first daughter is byte-identical (the `.tie` header's `breed_true:1`, `mov_daught:80`), and pin
   the run digest.
3. Optionally regenerate the same bytes from **GeneScript** to also exercise `GSINV-ANCESTOR`
   (compile-path parity), but the byte fixture above is the authoritative subject and does not
   depend on the compiler being finished.
4. Note `adro` (0x1b/27) is the **one** classic-32 opcode `0080aaa` never uses (it uses `adrb`/`adrf`
   only) — a coverage fixture should not assume the ancestor exercises `adro`.

**Conclusion:** the golden breed-true test *does* have a real, source-exact subject. A-11 is a
spec-packaging gap, not a data gap.

---

## 5. Bottom line for Part 1

Phase A was accurate and complete on mechanisms; this second pass **confirms all 12 findings**,
strengthens four of them with the header-vs-file two-tier-default fact (§2), adds the lazy-reap →
snapshot-state coupling (§3-N2) that links A-3 into the Phase C snapshot cluster, and **materializes
the ancestor** (§4). The reconciliation of these into one prioritized action list is `SUMMARY.md`.
