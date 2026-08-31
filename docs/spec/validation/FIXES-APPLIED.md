# Validation Fixes — Applied & Deferred Ledger

Tracks the disposition of every issue in [`SUMMARY.md`](SUMMARY.md) (S1–S32). Applied unattended
after the 4-phase validation. "Applied" = the spec/tests were edited this pass; "Deferred (impl)"
= consciously left to be resolved *as the code is written* (with rationale), not dropped.

## Applied (spec + pending-tests edited)

| id | What was done |
|---|---|
| **S1** | `founderId` seam wired end-to-end: `Creature` (REPRO 08 + M0 §4), inherit-on-divide, `inject(genome,{founderId})` (API 15), `CreatureSnapshot.founderId` (SNAP 14), per-founder `FounderCensus` on `ObservationFrame` (STAT 13). +REPRO-019, STAT-012, SNAP-011, API-012. Versus LINEAGE imports the census. |
| **S2** | Tank per-cell `genotypeOf`+`ips` (+`bucketBytes`, class 3 dead-noise) added to `TankView` (STAT 13). +STAT-011. |
| **S3** | `RunDigest` single-owned by SNAP 14 (`atCycle`); STAT re-exports (dup removed). |
| **S4** | `InspectView` single-owned by worker (ui/01), widened to the full inspector field set; inspector (ui/04) imports it (dup removed). |
| **S5** | `Snapshot` completed: `generations`, `avgSizeScaled`, `slicerCursor`, `remainingInSlice`, `mutationCounters`, `genebank` table, `CreatureSnapshot.founderId`. +SNAP-011..016 (incl. completeness meta-check). M0 §15 list synced. |
| **S6** | `Scenario.slicer` made configurable; **DEFAULT `sizeDependent:false`** (the shipped-experiment, size-selecting regime — not the unused C-header value), `slicePow`/`sliceSize` exposed. +SLICE-010/011. Study 04↔06 reconciled to the source. |
| **S7** | `Scenario.malMode` exposed (default `first-fit`, documented as an M0 determinism choice, not fidelity). |
| **S8** | `Scenario.mutation` widened to the full `MutationRates` (owned by MUT 11). |
| **S9** | Lazy-reap snapshot fields reserved (mutation counters / `avgSizeScaled` land now; per-creature `repinst` folds in when lazy-reap is implemented in M1). |
| **S10** | Canonical subset opcode-ordering rule pinned in ISA 04 (nop0=0,nop1=1, then classic-32 load order). +ISA-010. |
| **S11** | Ancestor `0080aaa` materialized as `packages/engine/test/fixtures/ancestor-0080aaa.ts` (exact 80 bytes + oracle). Golden = INT-ANCESTOR-GOLDEN. |
| **S12** | Monorepo: root is now an npm-workspaces root (`npm test` aggregates all packages); new `@tierra26/integration` with 10 INT-* + 8 PROP-* suites. |
| **S13** | Determinism edges: ISA-011 (mutation-domain fold any N), TMPL-011 (integer avgSize searchLimit), REAP-009 (integer-scaled fullness), RNG-016 (int(1)/rejection). |
| **S14** | Seed canonical at `scenario.seed`; `RunDescriptor.seed` mirror removed (SNAP/API/M0 aligned). |
| **S15** | Single scalar surface `LiveStats` (owned by STAT 13); API `stats()` returns it (dup `Stats` removed). |
| **S16** | `MatchDescriptor` documented as deriving a `RunDescriptor` (`toRunDescriptor`), with its own `VersusLink` (≠ sandbox `RunLink`) and a `resolveScenario` resolver (versus RUNNER 03). |
| **S17** | `Diagnostic` single-owned by DIAG 06; parser (GS 01) imports it; `Loc`≡`SourceSpan`. |
| **S18** | Content parse shape renamed `PlaygroundDirective`; normalized `PlaygroundConfig` owned by PLAY 02. |
| **S21** | CHARTS `sizeHistogram` aligned to engine `HistBin {key,label,count}` (ui/05). |
| **S22** | **DECIDED — stack over/underflow is a silent 10-slot ring** (no `E`), matching Tierra exactly. Reversed the earlier [MOD]. Updated CPU 07 (§3/§7/§8, CPU-005/006), ISA-VM §2.1/§2.6, and the CPU tests. |
| **S23** | `reaper.reapRndProp` slot added to `Scenario` (default 0 = deterministic). |
| **S24** | `scenario.disturbance {freq,prop}` slot added (default off). |
| **S25 (partial)** | Added the P0 gap C flagged: CPU flag tests **CPU-009/010** (S/Z + nop-clears-flags) — the subsystem had zero. |
| **S26** | UI doc↔test defects fixed: un-tagged the two logic criteria mis-marked `(visual)` (TANK-006/015); restored the dropped half of WORKER-006. |
| **S28** | `limits.dropDead` slot added (default 0 = off). |
| **S29** | `scenario.inoculation {placement,offsets}` slot added (default first-fit). |

## Deferred to implementation (with rationale — tracked, not dropped)

| id | Why it's better done while writing the code |
|---|---|
| **S19** (AST type-name drift `Program`/`Ast`/`Stmt`/`Statement`) | Resolves in one line when each package writes its `types.ts` — the canonical names (`Program`, `Stmt`, `CheckedProgram`) get fixed at the single definition site. Noted as GS 01's ownership; churning prose now risks re-drift. |
| **S20** (SourceMap shape drift COMP↔PLAY) | Same: PLAY imports COMP's `SourceMap` when the type is written. A prose note now is lower-value than the compile-time import that will enforce it. |
| **S25 (bulk ~119 §4/§6 behavior criteria + 8 PROP suites)** | These are best authored as **real tests**, not `it.todo` placeholders, at the moment each system is implemented — that is when the exact fixtures/thresholds are known. Adding 119 vague todos now would be low-signal. The integration `INT-*`/`PROP-*` scaffolds exist; per-system negative-path + edge criteria land with each system's PR. |
| **S27** (divide distinct-byte vs written-span) | Accepted [MOD], already documented + tested (REPRO). Only differs for scattered-write mutants; revisit only if evidence warrants. |
| **S30** (6 nice-to-have nits) | Pin each in its owning doc during the relevant system's implementation (they ride along S1/S5/S15 work). |
| **S31** (~10 vague criteria to sharpen) | Sharpen thresholds/sample-sizes when the real test is written (a todo can't carry a fixture). Flagged in C §5. |
| **S32** (reaper single death-event vs Tierra's termination-reason taxonomy) | Conscious fold; revisit only if Versus/analytics need cause-of-death. |

## Net effect
- Pending criteria: **591 → 611** (engine 191→211 via the new founder/tank/snapshot/regime/flag
  criteria; integration 18; others unchanged). All suites green-todo, 0 fail.
- All 5 BLOCKERs and all 8 HIGHs from SUMMARY are **applied**. Mediums/lows are applied or
  consciously deferred-to-implementation above.
- The spec set is now internally consistent on the shared contracts and has a materialized
  ancestor + a runnable cross-package harness — ready for M0 implementation.
