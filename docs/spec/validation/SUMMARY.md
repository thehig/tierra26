# Validation SUMMARY — Reconciled Master Action List (Phases A · B · C · D)

**Verdict.** The tierra26 spec set is **fundamentally sound and near-implementation-ready**: the
Tierra *mechanisms* are captured with high fidelity (32-op ISA verified byte-for-byte against
`gb0/opcode.map`; template addressing, the write-protection parasite niche, `mal→copy→divide` with
the integer 0.7 gate, the four mutation families, genotype identity/naming, single-stream RNG
reproducibility — all present and faithful), the spec-as-checklist has near-zero doc↔test ID
divergence, and the determinism discipline (integer-only, single RNG, seed-0-normal) is stated
consistently everywhere (Phase B "positive notes"; Phase A §15; Phase D §1). What remains is **not
missing dynamics** — it is (a) a handful of **shared data-structure contracts** defined twice or
missing a field (Phase B's 4 BLOCKERs), (b) a **snapshot-completeness hole** that would let a green
reproducibility suite silently diverge (Phase C + D), (c) **default-regime & config-surface
decisions** where the spec inherited Tierra's *C-header* defaults rather than the values its
shipped experiments actually used (Phase A + D §2), and (d) the **absence of any cross-package test
harness** plus the **un-materialized ancestor** needed for the golden runs SPEC §12 mandates
(Phase C + D §4). All are settle-before-you-code contract/decision items, not redesigns.

**Counts after de-duplication: BLOCKER 5 · HIGH 8 · MEDIUM 13 · LOW 12.**

---

## Master issue table (de-duplicated, ranked)

Phase key: A=reference-coverage, B=consistency/design, C=test-coverage, D=second-pass/source.
"Owning doc" = the single doc that should absorb the fix (others import/reference it).

### BLOCKER — settle before any shared type or the engine `World` is coded

| id | Issue (one line) | Phase(s) | Affected spec docs | Recommended resolution | Owning doc |
|---|---|---|---|---|---|
| **S1** | `founderId` lineage seam absent from every engine doc it must live in (set at inject, inherited on `divide`, in the frame **and** the snapshot). | A§12, B-BLK1, C§3+seam-alert, D§1 | engine REPRO `08 §2/§4.3`, API `15 §2/§4.2`, STAT `13 §2`, SNAP `14 §2/§3`, worker `ui/01 §2`; versus LINEAGE `02 §2` | Add `Creature.founderId` (+inherit line on divide); optional `founderId` on `inject`/`Injection`/worker `inject`; per-founder census (fixed-N) on `ObservationFrame`; **add to `CreatureSnapshot` + SNAP-008 list** (else replay mis-scores). | engine SNAP `14` (serialized shape); REPRO `08` (field+inherit) |
| **S2** | Tank per-cell `genotypeOf` + `ips` channels (colour-by-species, IP sparks) absent from STAT's `ObservationFrame`; the headline "star" view is unbuildable as written. | B-BLK2, C(TANK) | STAT `13 §2/§4.5`, ui TANK `02 §2/§9` | Add `genotypeOf:Uint32Array` + `ips:Uint32Array` (reused buffers) to STAT `TankView`; resolve the dead-cell retain-vs-zero question (TANK §9-Q2). | engine STAT `13` |
| **S3** | `RunDigest` defined twice, two owners, field name `cycle` vs `atCycle`; golden harness + INV-REPLAY/DET can bind to different types. | B-BLK3, C(SNAP) | STAT `13 §2`, SNAP `14 §2` | SNAP owns `RunDigest`+`digest()`; STAT re-exports. One field name (`atCycle`). Lock the FNV-1a/uint32 checksum constants once. | engine SNAP `14` |
| **S4** | `InspectView` defined twice with incompatible shapes; the wire owner can't supply what the Inspector renders (`genotypeLabel`, `population`, `daughter`, `cell`, `sp`, `parentId`; `registers`/`flags` object vs scalar). | B-BLK4 | worker `ui/01 §2`, inspector `ui/04 §2` | Worker `01` is sole owner; widen to the inspector field set (resolve label/population/daughter/bounds worker-side); `registers→{A,B,C,D}`, `flags→{E,S,Z}`; inspector imports. | ui worker `01` |
| **S5** | **Snapshot completeness hole:** `Snapshot` (SNAP `14 §3`) omits slicer cursor+`remainingInSlice`, mutation counters, genebank state, and stats `generations`/`avgSize` — **plus** (D-N2) per-creature `repinst` and running `RepInst`/`AverageSize` once lazy-reap/rate-calc are on. A passing INV-ROUNDTRIP would still silently diverge. | C§2(SNAP-012..015)+§6, D§3-N2, B(RunDigest) | SNAP `14 §2/§3` + owners slicer `09 §9`, mutation `11 §3`, genebank `12 §5`, stats `13 §3` | Widen the Snapshot interface **and** SNAP-008's enumeration to every mutable field its owning spec serializes; add the four clusters now, reserve `repinst`/`RepInst`/`avgSize` for M1. `avgSize` already feeds `searchLimit`/mutation cadence — snapshot-critical today. | engine SNAP `14` |

### HIGH — decide before defaults freeze and before golden fixtures are baked

| id | Issue (one line) | Phase(s) | Affected spec docs | Recommended resolution | Owning doc |
|---|---|---|---|---|---|
| **S6** | **Slice regime is locked to the header default, not any experiment.** Spec fixes `SizDepSlice=1` (size-neutral); **every** shipped scenario (si0/1/2/3/7) uses `0` (uniform slice [0,50], pro-small). `SlicePow`/`SliceSize` not exposed. | A-1/A-2, D§2/N-1 | slicer `09 §4.1`, API `15 §2`, study `04`/`06` | Reconcile study 04↔06 to the source fact (file=`0`, header=`1`). **Choose the default deliberately** and document it; make `slicer.{sizeDependent, slicePow, sliceSize}` real config; ship both a size-neutral and a size-selection scenario. | engine slicer `09` (+API `15`) |
| **S7** | Default `MalMode`=first-fit matches **neither** header (2=random) nor any shipped run (1=better-fit); suppresses the spatial aggregation that enables parasitism/sociality. Not exposed in `Scenario`. | A-4, D§1/§2 | alloc `03 §7`, API `15 §2` | Keep the `MalStrategy` hook; implement a reference default (random or near-mother) for M1; expose `malMode` in `Scenario`; label first-fit an explicit M0-determinism choice, not fidelity. | engine alloc `03` |
| **S8** | `Scenario.mutation` = `{flaw,copy,cosmic}` only; omits `divMut`, `ins/del/cro` (instr **and** segment), `croSamSiz`, `mutBitPropPct` — the operators that evolve genome size/structure, which mutation `11` fully specifies. | A-6, D§1 | API `15 §2`, mutation `11 §2` | Widen `Scenario.mutation` to the full `MutationRates` shape owned by mutation `11`. | engine API `15` |
| **S9** | Lazy reaping (`LazyTol` vs `RepInst`) deferred to M1 with weak justification — but it is a **core per-slice** anti-parasite/anti-junk pressure (`slicers.c:158/205`), on in every shipped scenario. Deferring risks a distorted first-milestone ecology. | A-3, D§1/§3-N2 | reaper `10 §7`, slicer `09 §7` (+SNAP `14`) | Add lazy-reap to M1 alongside mutation, or document why disturbance/soup-full death suffices. If added, snapshot must carry `repinst`+`RepInst` (folds into S5). | engine reaper `10` |
| **S10** | Subset token type / naming / **opcode-ordering** unpinned across content→engine; an unpinned order makes the same subset emit **different opcode bytes** in different layers → non-portable/non-reproducible genomes. | B-SF4 | ISA `04 §9`, API `15 §2`, PROGRESS `05 §2`, content `01/02`, VOCAB | Pin one representation (engine **mnemonics**); assign VOCAB verb→mnemonic owner; fix one order (nop0=0/nop1=1 then canonical sort); route named subsets via `PROGRESS.activeSubset`. | engine ISA `04` |
| **S11** | Canonical ancestor `0080aaa` not materialized as classic-32 bytes — the breed-true golden test (SPEC §12) has no subject. **It IS fully recoverable** from `gb0/0080aaa.tie` (exact 80-byte sequence + gene map in D §4). | A-11, C§3, D§4 | API `15` (fixture), repro `08 §4.4` | Emit the 80-byte array as an engine fixture + injecting `Scenario`; author `INT-ANCESTOR-GOLDEN` (breed-true + pinned digest). `adro` is the one op the ancestor never uses. | engine API `15` (fixture) |
| **S12** | **No cross-package test harness.** Every cross-layer invariant lives inside one package with "no src imports yet"; root `npm test` runs one file; ~616 `it.todo`s aren't aggregated; no workspaces. The golden/integration runs SPEC §12 mandates can't execute. | C§3 | root config, all packages | Create `packages/integration/test/*` with sibling dev-deps; add npm-workspaces `test` aggregation; home the 10 `INT-*` + 8 `PROP-*` suites (esp. SNAPSHOT-REPLAY-E2E, ANCESTOR-GOLDEN, FOUNDER-ATTRIB-MUTATION). | new `packages/integration` |
| **S13** | Determinism sharp edges with no criterion: `searchLimit` from **integer** avgSize (TMPL-013), integer-scaled fullness (REAP-012), `int(1)` no-advance (RNG-016), mutation-domain fold for non-power-of-two subsets (ISA-013/PROP-MUT-DOMAIN). Any float or stray draw = silent replay break. | C§2/§4/§6 | tmpl `06`, reaper `10`, rng `01`, isa `04` | Add the four criteria + the `PROP-*` elevations; assert integer-only on every fate path. | respective engine docs |

### MEDIUM — reconcile during implementation; low blast radius but real

| id | Issue | Phase(s) | Affected docs | Resolution / owner |
|---|---|---|---|---|
| **S14** | `RunDescriptor.seed` present in some docs, absent in others; `M0 §3`↔`§14` self-conflict. | B-SF1 | API `15`, M0, SNAP `14`, SPEC | Seed canonical **inside** `scenario`; drop the top-level field (or one documented mirror). Owner: API `15`. |
| **S15** | Two "stats" surfaces + overloaded `Stats` service name + `fullness` in 3 representations (Float01 / scaled-int/1000 / recomputed). | B-SF2, B-NTH2 | API `15`, STAT `13`, CHARTS `ui/05` | One scalar type (`LiveStats`); rename service → `StatsService`; pin `fullness` to scaled-int on any fate/digest path. Owner: STAT `13`. |
| **S16** | `MatchDescriptor` isn't a `RunDescriptor` superset; `RunLink` can't round-trip it; `scenarioId→Scenario` resolver undefined. | B-SF3 | versus RUNNER `03`, ui SHELL `07`, API `15` | Describe MatchDescriptor as a recipe that **derives** a RunDescriptor; give Versus its own link payload; define the resolver. Owner: versus RUNNER `03`. |
| **S17** | `Diagnostic` defined twice in genescript (parser vs validator), mismatched field names; shared `nodeId` consumed but undefined on the AST. | B-SF5 | GS `01 §2`, DIAG `06 §2`, BLOCK `07`, EDITOR `03` | One `Diagnostic` (DIAG's); reconcile `Loc`↔`SourceSpan`; add `nodeId` to AST nodes. Owner: GS `01` (AST) + DIAG `06` (shape). |
| **S18** | `PlaygroundConfig` defined twice in the content package (parse-shape vs normalized). | B-SF6 | content CONTENT `01`, PLAY `02` | Rename the parse shape; reserve `PlaygroundConfig` for PLAY's normalized type. Owner: content PLAY `02`. |
| **S19** | AST type-name drift (`Program`/`Ast`/`CheckedProgram`; `Stmt`/`Statement`). | B-SF7 | GS `01`, BLOCK `07`, COMP `04`, EDITOR | Canonical `Program`/`Stmt` (GS `01`); name a validated `CheckedProgram` once; others import. Owner: GS `01`. |
| **S20** | `SourceMap` shape drift (statement-index vs line; `start/end` vs `byteStart/byteEnd`). | B-SF8 | COMP `04 §2`, PLAY `02 §2` | PLAY imports COMP's `SourceMap` verbatim; derive any line array distinctly. Owner: genescript COMP `04`. |
| **S21** | CHARTS size-histogram field mismatch (`size` vs `key`) and needs `avgSize`/`cycles` the `stats` event omits. | B-SF9 | CHARTS `ui/05`, STAT `13` | Align to `HistBin`; readouts read `LiveStats` from the frame (ties S15). Owner: ui CHARTS `05`. |
| **S22** | Stack over/underflow raises `E` vs Tierra's silent ring (`instruct.c:1503/1526`). | A-5, D§1 | cpu `07 §7`, ISA-VM | Decide before golden runs freeze; for fidelity keep the depth-10 silent ring, drop the `E`. Owner: cpu `07`. |
| **S23** | `ReapRndProp` stochastic victim (si*=.3) not exposed; spec deterministic (correct for M0). | A-7, D§1 | reaper `10`, API `15` | Add `reaper.reapRndProp` toggle (already sketched [MOD]). Owner: reaper `10`. |
| **S24** | Disturbance mechanism has no `Scenario` slot (on in si3/si7, `DistFreq=10`); enabling it later = schema change. | A-8, D§1 | reaper `10`, API `15` | Add `scenario.disturbance{freq,prop}` (even if unimplemented in M0); reaper owns the M1 mechanism. Owner: API `15` + reaper `10`. |
| **S25** | ~119 missing per-system §4/§6 behavior criteria + 8 property/fuzz suites (happy-path bias; negative-path parity; CPU flag subsystem has **zero** tests). | C§2/§4 | all system §8 checklists | Add the append-only criteria + `PROP-*` suites; prioritise CPU-009/010 (S/Z, nop-clears-E), API/MUT/GOAL negative paths. Owner: each system doc. |
| **S26** | 6 UI doc↔test defects: two logic criteria mis-tagged `(visual)` (TANK-006/015), a truncated criterion dropping its load-bearing half (WORKER-006), 4 truncated names, INV-INT undefined-in-§5. | C§1 | ui `02`/`01`/`03` tests, arch `00 §5` | Restore full §8 text; un-tag the two logic criteria; promote C-INT→INV-INT or relabel. Corrections, not new tests. Owner: respective test files. |

### LOW — track; small blast radius

| id | Issue | Phase(s) | Resolution / owner |
|---|---|---|---|
| **S27** | Divide fill uses distinct-byte count, dropping the written-span guard (`MovOffMin/Max`); differs only for scattered-write mutants. | A-9 | Note as accepted+tested divergence. repro `08 §7`. |
| **S28** | `DropDead` reproductive-collapse watchdog (si*=5) absent. | A-10, D§1 | Add `limits.dropDead` + tick-loop check (M1). API `15` / M0 loop. |
| **S29** | Initial inoculation layout (`center`, half-soup gap, `NumCells`) not modelled; inject is plain first-fit. | A-12, D§1 | Allow injection start-address / gap or a scenario `inoculation` directive. API `15 §4.2`. |
| **S30** | Six B "nice-to-have" nits: `genotypes==aliveCount`; `fullness` 3-way (ties S15); observe-cadence default owner; `step`=instruction phrasing; neutral-founder partition wording; reaper-threshold units in M0. | B-NTH1..6 | Pin each in its owning doc during S1/S5/S15 work. |
| **S31** | ~10 vague/under-specified criteria (VSINV-MIRROR-SEED, SLICE-009, MUT-013/14, TMPL-010, RNG-013/14/15, COMP-002/LBL-014 ordering). | C§5 | Pin thresholds/sample sizes/fixtures before authoring; land LBL-014 enumeration order before COMP-002 golden. |
| **S32** | Reaper termination-reason taxonomy folded to a single death event (`tierra.h:71-80`). | D§3-N3 | Conscious fold; revisit only if Versus/analytics want cause-of-death. reaper `10 §7`. |

---

## Recommended fix order (before engine `src/` is written)

1. **Lock the shared data-structure contracts first (S1–S5).** Everything downstream binds to
   these types. Do them as one reconciliation pass: settle `founderId` end-to-end, the tank
   channels, the single `RunDigest`, the single `InspectView`, and — critically — the complete
   `Snapshot` interface (S5). Snapshot completeness is the keystone: it depends on the *final* shape
   of Creature (S1's `founderId`), slicer cursor, mutation counters, genebank, and stats
   `avgSize`/`generations` — so freeze it only after S1 and after the S6/S9 decisions below.
2. **Make the two engine seams real in the engine docs (S1 founderId, S2 tank),** not just in the
   consumer specs — this is where a green engine suite could otherwise hide a Versus/UI break.
3. **Take the default-regime decisions (S6 slice regime, S7 MalMode, S8 mutation surface, S9
   lazy-reap) before baking any golden fixture** — each changes what every golden run produces, so
   deciding late means re-baking every digest. S6 is the highest-leverage single decision (it sets
   whether size is under selection and follows the *experiment* value `0`, not the header `1`).
4. **Pin the subset opcode-ordering rule (S10)** before any genome bytes are authored — it governs
   genome portability/reproducibility across the content→engine boundary.
5. **Materialize the ancestor (S11)** and **stand up the integration harness + workspaces (S12)** —
   without these the SPEC §12 golden runs and every cross-layer invariant remain un-runnable. The
   ancestor bytes are ready (D §4); the harness is greenfield.
6. **Close the determinism sharp edges (S13)** as the engine core lands (integer avgSize/fullness,
   RNG no-advance, mutation domain) — cheap now, silent-replay-break later.
7. Medium/low contract nits (S14–S32) can be folded into the relevant system's implementation PR.

---

## What is genuinely SOLID (do not churn)

- **The ISA.** All 32 classic opcodes, load order, bindings, and semantics verified byte-for-byte
  against `gb0/opcode.map` (Phase A §3, D §1); `ifz`/`math`/`movdd` routing faithful.
- **Core dynamics mechanisms.** Complementary template addressing (wrap/miss/limit), the
  write-protection asymmetry that *is* the parasite niche, `mal→copy→divide` with the integer 0.7
  gate, reap-to-make-room + error-up/reproduction-down ordering, the four mutation families with
  correct period-vs-raw-modulus firing, genotype identity + `Int2Lbl` naming, single-stream seeded
  reproducibility. Present **and** faithful — not just named (Phase A §15, D §3).
- **Determinism doctrine.** Integer-only, single RNG, fixed draw order, seed-0-is-normal — stated
  identically across ISA-VM, M0, RNG, and every consumer's C-*-DET (Phase B positive notes).
- **Single-source-of-truth wiring.** VOCAB→KEYWORD projection, COMP reading opcodes from the active
  set, UI deriving colours/facts from content — coherent and well-guarded (Phase B).
- **The spec-as-checklist mapping.** Near-zero doc↔test ID divergence across all 5 packages; every
  §8 criterion has an `it.todo` and vice-versa (Phase C headline). The gaps are *added* criteria and
  *reconciled* contracts, not a broken structure.

*Sources:* `docs/spec/validation/A-reference-coverage.md`, `B-consistency-and-design.md`,
`C-test-coverage-gaps.md`, `D-final-reference-recheck.md`. Ground truth:
`reference/tierra-v6.02/tierra/` (`soup_in`≡`si0`, `soup_in.h`, `si1/2/3/7`, `gb0/opcode.map`,
`gb0/0080aaa.tie`, `slicers.c`, `instruct.c`, `memalloc.c`, `bookeep.c`, `tierra.h`).
